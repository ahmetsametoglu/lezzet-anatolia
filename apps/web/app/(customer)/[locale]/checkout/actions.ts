'use server';

import { AddressService, OrderService, ReservationService, serviceDb } from '@lezzet/database';
import { hasLocale } from 'next-intl';
import type { Address, AddressInsert, PaymentMethod } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { currentCustomerId } from '@/lib/guard';
import { updateAddress } from '@/lib/account/addresses';
import { CustomerError, customerErrorKey, type CustomerResult } from '@/lib/customer-error';
import { captureError, SOURCES } from '@lezzet/observability';
import { readPlaceWarehouses } from '@/lib/delivery/read-place';
import { getCartView } from '@/lib/cart/read';
import { formatPrice } from '@/lib/storefront/format';
import { clearOrderedLines } from '@/lib/cart/settle';
import type { CartEntry } from '@/lib/cart/cart-types';
import { createCheckoutDraft } from '@/lib/order/checkout-draft';
import { reserveOrderStock } from '@/lib/order/reserve';
import { transitionOrder } from '@/lib/order/transition';
import { createCheckoutSession } from '@/lib/order/checkout-session';
import { resolveCheckoutPayment } from '@/lib/order/checkout-options';
import { resolveDelivery } from '@/lib/order/delivery';
import { recordEvent } from '@/lib/analytics/record';
import { routing } from '@/i18n/routing';

/**
 * Checkout server action'ları (08.13).
 *
 * **Müşteri kimliği TEK yerde çözülür** — burada, oturumdan. Girişli müşteride de misafirde de
 * aynı yol: misafir "adım 0"da e-posta koduyla doğrulanınca giriş akışının kendisi (04) auth
 * kullanıcısını açıp oturumu kuruyor, yani doğrulamadan sonra ortada misafir kalmıyor. DOMAIN §10
 * "hesapsız sipariş yoktur" kuralının karşılığı budur: ayrı bir misafir kimliği taşımıyoruz.
 *
 * **İstemci hiçbir tutar göndermez.** Sepet niyeti (`entries`) ve seçimler (adres, gün, yöntem)
 * gelir; fiyat, kargo ücreti, indirim ve toplam her turda sunucuda yeniden çözülür.
 *
 * **Hata kapısı müşteriye ait** (`customerErrorKey`, denetim H1/H2 · 03.08): dönen şey metin değil
 * ANAHTAR. Bilinen tek hâl oturumun düşmesi (`session_expired`); geri kalan her şey `unexpected`e
 * iner ve ham mesaj yalnız `error_log`'a gider. Sipariş REDLERİ buradan geçmez — onlar bir hata
 * değil bir cevaptır ve kendi sözlüğünde yaşar (`t.rejected.*`, `ConfirmOutcome.rejected`).
 */

/** Ekranın bir adımda ihtiyacı olan her şey — tek turda, çünkü üçü birbirine bağlı. */
export interface CheckoutSnapshot {
  addresses: Address[];
  /** Seçili adrese göre çözülmüş teslimat; adres seçilmemişse null. */
  delivery: {
    deliveryType: 'route' | 'shipping';
    availableDates: string[];
    requiresDateChoice: boolean;
    /** Rota dışı + soğuk zincir: sipariş verilemez, sepet bölünmeli (K32). */
    blocked: boolean;
  } | null;
  /** Ödeme seçenekleri + kargo + toplam; adres seçilmemişse null. */
  payment: {
    methods: PaymentMethod[];
    creditAvailable: boolean;
    codBlockedReason: string | null;
    cashWarning: boolean;
    shippingFeeCents: number;
    shippingFreeReason: 'route' | 'threshold' | null;
    orderTotalCents: number;
    minBasketOk: boolean;
    missingForMinBasketCents: number;
  } | null;
}

/**
 * Adım verisini çözer. Adres seçilmeden de çağrılır (liste gelsin diye) — o zaman teslimat ve
 * ödeme null döner, çünkü ikisi de adresin cevabıdır ve adres yokken uydurulamaz.
 */
export async function loadCheckoutAction(
  locale: string,
  entries: CartEntry[],
  addressId: string | null,
  /**
   * Sepette girilen kupon kodu — checkout'a KADAR taşınmalı. Taşınmadığında ekran kendisiyle
   * çelişiyordu: kalem satırları ve indirim sepet bağlamından (kuponlu), toplam ise buradan
   * (kuponsuz) geliyordu; üstelik siparişe yazılan tutar da kuponsuz oluyordu — müşteri kuponu
   * kullanmış görünüp TAM FİYAT ödüyordu (29.07 denetimi).
   */
  couponCode: string | null = null,
  /**
   * Sepetin KARGO grubundan açılan ikinci sipariş mi (19.7 · `/checkout?group=shipping`).
   *
   * Taslakla AYNI bayrak, aynı gerekçe (`createCheckoutDraft` künyesi): tür türetilmez, açık
   * seçilir. Burada da geçmesi şart — geçmezse ekran adresin cevabını gösterir ("kapıya teslim,
   * kapıda ödeme mümkün, şu günler"), taslak ise kargo siparişi açar. Müşteri ekranda gördüğü
   * ödeme yöntemini seçer, onaylar ve kasada reddedilirdi.
   */
  shippingOrder = false,
): Promise<CustomerResult<CheckoutSnapshot>> {
  try {
    if (!hasLocale(routing.locales, locale)) throw new Error('Geçersiz dil');
    const customerId = await currentCustomerId();
    if (!customerId) return { data: { addresses: [], delivery: null, payment: null }, errorKey: null };

    const db = serviceDb();
    const addresses = await new AddressService(db).listByCustomer(customerId);
    const selected = addresses.find((a) => a.id === addressId) ?? addresses.find((a) => a.isDefault) ?? addresses[0];
    if (!selected) return { data: { addresses, delivery: null, payment: null }, errorKey: null };

    const cart = await getCartView(locale as Locale, entries, { customerId, couponCode, ...(await readPlaceWarehouses()) });
    const delivery = await resolveDelivery({
      postalCode: selected.postalCode,
      hasNonShippableItem: cart.lines.some((l) => !l.shippable),
    });

    // Kargo siparişinde tür adresin cevabını EZER (19.15) ve gün hiç sorulmaz: tarih taşıyıcıya
    // bağlıdır, söz verilmez. Ezme tek yönlü — normal taslak adresin cevabını olduğu gibi kullanır.
    const deliveryType = shippingOrder ? ('shipping' as const) : delivery.deliveryType;

    const options = await resolveCheckoutPayment({
      customerId,
      deliveryType,
      basketCents: cart.totalCents,
      // Oran satırın kendi gerçeğinden gelir (paketse kalemlerin en yükseği) — sabit yazmak
      // malzeme gibi %20'lik kalemlerde kargo KDV'sini yanlış bölerdi.
      lines: cart.lines.map((l) => ({ totalCents: l.lineTotalCents ?? 0, vatRate: l.vatRate })),
    });

    return {
      data: {
        addresses,
        delivery: {
          deliveryType,
          availableDates: shippingOrder ? [] : delivery.availableDates,
          requiresDateChoice: shippingOrder ? false : delivery.requiresDateChoice,
          // Kargo siparişi soğuk zincir kalemi TAŞIYAMAZ — adres rota içinde olsa bile. Taslak
          // bunu ayrıca reddediyor (`cold_chain_unshippable`); ekran aynı gerçeği önce söyler.
          blocked: shippingOrder ? cart.lines.some((l) => !l.shippable) : delivery.shippingBlockedReason === 'cold_chain',
        },
        payment: {
          methods: options.methods,
          creditAvailable: options.creditAvailable,
          codBlockedReason: options.codBlockedReason,
          cashWarning: options.cashWarning,
          shippingFeeCents: options.shippingFeeCents,
          shippingFreeReason: options.shippingFreeReason,
          orderTotalCents: options.orderTotalCents,
          minBasketOk: options.minBasketOk,
          missingForMinBasketCents: options.missingForMinBasketCents,
        },
      },
      errorKey: null,
    };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * Var olan adresi düzenle — **checkout'tan çıkmadan.**
 *
 * Ekran adresi kaydettikten sonra onu bir daha düzenleyemiyordu: kartlar yalnız SEÇİLİYORDU
 * (kullanıcı bildirimi, 01.08). Yazım hatası yapan müşterinin tek çıkışı ikinci bir adres açmaktı;
 * o da kurye için iki benzer kayıt, müşteri için "hangisi doğruydu" demek. Hesap sayfasında
 * düzenleme zaten vardı — eksik olan checkout'un kendi kapısıydı.
 *
 * **Sahiplik doğrulanır ve kapıda:** `addressId` istemciden geliyor. `updateAddress` sahipliği
 * kendi içinde sınıyor (`lib/account/addresses` → `ownedAddress`), yani başkasının adresi
 * güncellenemez. Kapı ayrıca `isDefault`i patch'ten ayıklar — varsayılan seçimi kendi işidir.
 *
 * Varsayılan bayrağı AYRI parametre, patch'in içinde değil: tek satırı işaretlemek yetmiyor,
 * öbürlerinin bayrağı düşmek zorunda. Tek turda gidiyor çünkü ikinci bir çağrı, kaydeden ama
 * varsayılanı yazamayan bir ara hâl bırakabilirdi.
 */
export async function updateCheckoutAddressAction(
  addressId: string,
  patch: Omit<AddressInsert, 'customerId'>,
  makeDefault: boolean,
): Promise<CustomerResult<true>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');
    await updateAddress(customerId, addressId, patch);
    // Varsayılan TEKİLDİR (0013): servis eskisini düşürür, ekran o kuralı bilmez.
    if (makeDefault) await new AddressService(serviceDb()).setDefault(addressId);
    return { data: true, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * Yeni adres — checkout'tan çıkmadan. Adres MÜŞTERİYE bağlanır, kimlik oturumdan gelir.
 *
 * **Kendi girdi tipi YOK ve olmamalı** (denetim bulgusu M3, 02.08). Burada `CheckoutAddressInput`
 * diye formunkinin alan alan kopyası bir arayüz duruyordu — üstelik `NewAddressInput`'ın künyesi
 * tam bu senaryoyu anlatıyor: *"iki kopya olsaydı biri yeni bir alan öğrenip öteki öğrenmezdi;
 * `recipient` ile `phone`ın bir kez sessizce düşmesi (28.07) tam olarak bu sınıftandı."* Aynı risk
 * aynı alanda ikinci kez kurulmuştu.
 *
 * Şimdi ikisi de `updateCheckoutAddressAction` ile AYNI şekli alıyor: dönüşümü form kendi yanındaki
 * `toAddressFields` ile yapar (hesap sayfası da öyle yapıyor), kapı yalnız yazar. Yan kazanç:
 * eskiden buradaki elle yayma `country`yi hiç geçmiyordu — kolonun `default 'FR'`i kurtarıyordu,
 * yani ikinci ülke açıldığı gün sessizce yanlış olacaktı.
 */
export async function addCheckoutAddressAction(
  fields: Omit<AddressInsert, 'customerId'>,
  makeDefault: boolean,
): Promise<CustomerResult<Address>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');
    const addresses = new AddressService(serviceDb());
    const created = await addresses.addForCustomer({ ...fields, customerId });
    // Varsayılan TEKİLDİR (0013): servis eskisini düşürür, ekran o kuralı bilmez.
    if (makeDefault) await addresses.setDefault(created.id);
    return { data: created, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * "Siparişi onayla" — taslağı açar, stoğu ayırır, ödeme niyetini doğurur.
 *
 * **Tek turda** olması bilinçli: taslağı ayrı bir çağrıda açsaydık, ödeme adımına hiç gelmeyen
 * müşteriler ardında yetim taslaklar bırakırdı. Burada üçü tek karar: ya hepsi olur ya hiçbiri.
 *
 * Online ödemede `clientSecret` döner ve kart onayı **istemcide** verilir (Stripe iframe'i);
 * sipariş ödeme onayına kadar `draft` kalır ("önce ayır, sonra tahsil et").
 * Kapıda/vadeli ödemede sağlayıcıya hiç gidilmez ve sipariş BURADA kesinleşir (`confirmed`):
 * beklenen bir ödeme yok, bekletmenin de anlamı yok.
 */
type ConfirmOutcome =
  | { status: 'payment_required'; orderId: string; clientSecret: string; totalCents: number }
  /** Kapıda/vadeli: ödeme sağlayıcısı yok, sipariş açıldı. */
  | { status: 'placed'; orderId: string; totalCents: number }
  | { status: 'rejected'; reason: string; detail?: string[] | string };

export async function confirmCheckoutAction(input: {
  locale: string;
  entries: CartEntry[];
  addressId: string;
  deliveryDate: string | null;
  paymentMethod: PaymentMethod;
  onAccount?: boolean;
  marketingConsent?: boolean;
  /** Sepetteki kupon kodu; siparişin indirimi bunsuz hesaplanamaz. */
  couponCode?: string | null;
  /**
   * Çift sipariş kalkanı — istemcinin bu checkout denemesi için ürettiği anahtar.
   *
   * Kapsam BİLEREK dar: yalnız kart DIŞI yollarda işler. Orada sipariş bu çağrıda kesinleşiyor,
   * yani ikinci bir çağrı **kalıcı ve gerçek** bir çift sipariş demek. Kart yolunda ise çağrı
   * yalnız taslak açıyor; oradaki koruma `supersedeOpenDrafts` (açık taslak süpürülür) ve
   * düğmenin gezinme bitene kadar kapalı kalması.
   */
  idempotencyKey?: string | null;
  /** Sepetin kargo grubundan açılan ikinci sipariş mi — `loadCheckoutAction` ile aynı bayrak. */
  shippingOrder?: boolean;
}): Promise<CustomerResult<ConfirmOutcome>> {
  try {
    if (!hasLocale(routing.locales, input.locale)) throw new Error('Geçersiz dil');
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');

    /**
     * Aynı istek İKİNCİ kez geldiyse (çift tıklama, ağın yeniden denemesi) ikinci sipariş AÇILMAZ:
     * var olanın kimliği döner. Kart dışı yollarda sipariş bu çağrıda kesinleştiği için buradaki
     * tekrar, kalıcı bir çift sipariş demekti.
     */
    if (input.idempotencyKey) {
      const already = await new OrderService(serviceDb()).findByIdempotencyKey(input.idempotencyKey);
      if (already && already.status !== 'draft' && already.status !== 'cancelled') {
        return { data: { status: 'placed', orderId: already.id, totalCents: already.totalCents }, errorKey: null };
      }
    }

    // Önceki deneme(ler)den kalan açık taslak KAPATILIR — yenisini açmadan önce.
    await supersedeOpenDrafts(customerId);

    const draft = await createCheckoutDraft({
      locale: input.locale as Locale,
      customerId,
      entries: input.entries,
      addressId: input.addressId,
      deliveryDate: input.deliveryDate,
      paymentMethod: input.paymentMethod,
      onAccount: input.onAccount,
      couponCode: input.couponCode,
      idempotencyKey: input.idempotencyKey,
      shippingOrder: input.shippingOrder,
    });
    if (draft.status !== 'ok') {
      // Depo çözülemedi: iki sebep de siparişi engeller ama biri VERİ hatası (aynı kod iki bölgede),
      // öteki YAPILANDIRMA eksiği (kargo deposu yok). İkisi de operatörün müdahalesini bekler ve
      // müşteri bunu "ödeme hatası" olarak görmemeli — sebep ekrana taşınır, iz de bırakılır.
      if (draft.status === 'warehouse_unresolved') {
        // Log'a KİMLİK yazılır, içerik yazılmaz (CLAUDE.md §1): sebep ve müşteri kimliği yeter —
        // adres satırı ya da posta kodu kişisel veridir ve teşhis için gerekmez.
        await captureError(new Error(`checkout: yer çözülemedi (${draft.reason})`), {
          source: SOURCES.webAction,
          context: { reason: draft.reason, customerId },
        });
        return { data: { status: 'rejected', reason: draft.status, detail: draft.reason }, errorKey: null };
      }
      // Ürünün adı YETMEZ, sayısı da gerekir: "Kayseri Mantısı" cümlesi müşteriye ne yapacağını
      // söylemiyor, "Kayseri Mantısı (2)" söylüyor. Parantezin ne anlama geldiğini metin yazıyor —
      // sunucu tarafında dil sözlüğü açmadan (`rejected.insufficient_here`).
      const detail =
        draft.status === 'blocked_lines'
          ? draft.lines
          : draft.status === 'insufficient_here'
            ? draft.lines.map((l) => `${l.name} (${l.available})`)
            : draft.status === 'date_unavailable'
              ? draft.availableDates
              : // Zamda ESKİ ve YENİ tutar BİRLİKTE taşınır (07.13): yalnız yeniyi göstermek
                // müşteriyi "ne kadar arttı" diye sepete geri döndürürdü. Tutar burada
                // biçimlendiriliyor çünkü `detail` bir DİZE listesi (öteki üç hâlle aynı sözleşme)
                // — ve biçimlendirici ekranınkiyle AYNI (`formatPrice`, dile duyarlı), yani
                // "12,50 €" ile "€12.50" ayrımı bir kez tanımlı.
                draft.status === 'price_changed'
                ? draft.lines.map(
                    (l) => `${l.name}: ${formatPrice(l.fromCents, input.locale as Locale)} → ${formatPrice(l.toCents, input.locale as Locale)}`,
                  )
                : undefined;
      measureRejection(draft.status);
      return { data: { status: 'rejected', reason: draft.status, detail }, errorKey: null };
    }

    /**
     * Kapıda ya da vadeli: para şimdi geçmiyor, sağlayıcıya hiç gidilmiyor — ama sipariş
     * **KESİNLEŞİR**. Önce yalnız taslak açılıp öyle bırakılıyordu; müşteri "tamamla" dediği hâlde
     * sipariş `draft` kalıyor, referans numarası doğmuyor ve onay sayfası siparişi ödemesi
     * beklenen bir kart siparişi sanıp "Ödemeniz onaylanıyor · bankanızdan onay bekliyoruz"
     * diyordu (29.07). Kapıda ödemede beklenen bir banka yok.
     *
     * Sıra ORDER_LIFECYCLE'ın kuralı: kapıda/vadeli ödemede rezervasyon `confirmed` geçişinde
     * yapılır ve **süresizdir** — düşmesini bekleyeceğimiz bir ödeme penceresi yok. Referans
     * numarası da ilk kalıcı durumda (`confirmed`) doğar.
     */
    if (input.paymentMethod !== 'online') {
      // Kalemler TASLAKTAN değil SİPARİŞTEN okunur: paket açılımı, parti seçimi ve fiyat
      // `createCheckoutDraft` içinde yapılıp satırlara yazıldı — ayırma da o yazılmış hâli
      // ayırmalı. Online yolda `createCheckoutSession` zaten aynı kaynaktan okuyor.
      const placed = await new OrderService(serviceDb()).getWithItems(draft.orderId);
      if (!placed) return { data: { status: 'rejected', reason: 'order_not_placed' }, errorKey: null };

      const reserved = await reserveOrderStock({ orderId: draft.orderId, items: placed.items, expiring: false });
      if (!reserved.ok) {
        // Ayrılamadıysa sipariş taslak kalır ve kapatılır: müşteriye söz verilmemiş olur.
        await cancelDraft(draft.orderId);
        measureRejection('insufficient_stock');
        return { data: { status: 'rejected', reason: 'insufficient_stock' }, errorKey: null };
      }

      const moved = await transitionOrder({ orderId: draft.orderId, to: 'confirmed' });
      if (moved.status !== 'ok') {
        await releaseOrderStock(draft.orderId);
        await cancelDraft(draft.orderId);
        return { data: { status: 'rejected', reason: 'order_not_placed' }, errorKey: null };
      }

      // Sipariş kesinleşti → sepetten O SİPARİŞİN kalemleri düşer. Toptan boşaltmak, iki gruplu
      // sepette kapıya siparişini veren müşterinin kargo grubunu da sessizce silerdi (19.7).
      await clearOrderedLines(customerId, draft.orderId);
      // Huninin son adımı (08.9). Tutar ve müşteri TAŞINMAZ — olay yalnız "bu oturum siparişle
      // bitti" der (`ANALYTICS §1`, İlke 2'nin bilinçli istisnası).
      void recordEvent({ type: 'order_placed' });
      return { data: { status: 'placed', orderId: draft.orderId, totalCents: draft.totalCents }, errorKey: null };
    }

    const session = await createCheckoutSession({ orderId: draft.orderId, marketingConsent: input.marketingConsent });
    if (session.status !== 'ok' || !session.clientSecret) {
      // Ödeme oturumu açılamadı: müşteri her şeyi doğru yaptı, kasa açılmadı. Huninin son
      // adımındaki kayıpların en pahalısı bu — sepet ve adres tamam, ödeme yolu yok.
      //
      // **Kartın REDDİ burada değil** ve bilerek: o karar Stripe'ın kendi arayüzünde veriliyor,
      // sunucuya hiç uğramıyor. Ölçmek için istemciden çağrılabilir ikinci bir yazma ucu açmak
      // gerekirdi (haritanın tek istisnası paylaşma) — üstelik red sebepleri zaten sağlayıcının
      // panosunda, bizden daha ayrıntılı duruyor.
      void recordEvent({ type: 'checkout_blocked', reason: 'payment_failed' });
      return { data: { status: 'rejected', reason: session.status }, errorKey: null };
    }
    // Kart yolunun huni adımı BURADA kapanır (08.9 · kullanıcı kararı 04.08). Buraya gelinmesi
    // müşterinin ödeme düğmesine bastığı anlamına gelir — sipariş henüz `draft`, ama huni bir
    // NİYET ölçüyor, muhasebe değil: bankadan dönmeyen bir onay müşterinin kararını değiştirmez.
    // Sipariş ve ciro SAYISI zaten defterin değil `order` tablosunun yetkisinde (`ANALYTICS §4`).
    //
    // Alternatifleri elemek: webhook'ta atmak imkânsız (orada ziyaretçinin oturumu yok, anahtar
    // istekten türüyor), dönüş sayfasında atmak yenilemede çift sayardı ve kapıdan tekilleştirme
    // beklemek gerekirdi. Kart reddedilip müşteri tekrar denerse ikinci olay yazılır — o da ikinci
    // bir niyettir, düzeltilecek bir sapma değil.
    void recordEvent({ type: 'order_placed' });
    return {
      data: { status: 'payment_required', orderId: draft.orderId, clientSecret: session.clientSecret, totalCents: draft.totalCents },
      errorKey: null,
    };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * Müşterinin ÖNCEKİ açık taslaklarını kapatır ve stoklarını geri bırakır.
 *
 * **Neden şart.** Kart reddedildiğinde ekran hatayı gösterip müşteriyi aynı sayfada bırakıyor;
 * "tekrar dene" her seferinde YENİ bir taslak sipariş ve YENİ bir rezervasyon açıyordu. Eski
 * rezervasyon TTL'i boyunca (30 dk) malı tutmaya devam ettiği için müşteri **kendi ilk denemesi
 * yüzünden** ikinci denemede "stok yetersiz" alabiliyordu — az stoklu üründe ürünü hiç alamıyordu.
 * Ve tutulan mal yalnız ona kapalı değildi: **başka müşterilere de yok görünüyordu** (29.07
 * denetimi + kullanıcı tespiti).
 *
 * Kapsam bilerek geniş: yöntem değiştiren müşterinin (karttan kapıda ödemeye geçen) ardında da
 * taslak kalmamalı. Yalnız `draft` olanlara dokunulur — kesinleşmiş sipariş buraya hiç girmez.
 *
 * **Süpürülen taslağın ödeme niyeti iptal EDİLEMİYOR** (siparişte sağlayıcı kimliği saklanmıyor).
 * Onaylanmamış bir niyet kendiliğinden hiç tahsil etmez; yine de dar bir ihtimal için webhook
 * tarafında emniyet var: iptal edilmiş bir siparişe ödeme gelirse para iade edilir.
 */
async function supersedeOpenDrafts(customerId: string): Promise<void> {
  const orders = new OrderService(serviceDb());
  // Taslaklar en yenilerdir: sayfanın başı yeter, tüm geçmişi taramaya gerek yok.
  const recent = await orders.listByCustomer(customerId, { limit: 20 });
  for (const order of recent.rows) {
    if (order.status !== 'draft') continue;
    // Sıra ÖNEMLİ: önce mal geri bırakılır, sonra sipariş kapanır. Tersi olsaydı iptal edilmiş bir
    // siparişin rezervasyonu ortada kalabilirdi.
    await releaseOrderStock(order.id);
    await cancelDraft(order.id);
  }
}

/** Ayrılamayan siparişin taslağı kapatılır: ortada söz verilmemiş yarım bir sipariş kalmaz. */
async function cancelDraft(orderId: string): Promise<void> {
  await new OrderService(serviceDb()).cancel(orderId, 'draft');
}

async function releaseOrderStock(orderId: string): Promise<void> {
  await new ReservationService(serviceDb()).releaseByOrder(orderId);
}

/**
 * Checkout REDDİNİN ölçüm karşılığı (08.9 · `ANALYTICS §3`).
 *
 * **Her ret ölçülmez** ve bu bir eksiklik değil, sınırın kendisi: defterin sebep kümesi müşterinin
 * SÜRTÜNMESİNİ anlatır, bizim arızalarımızı değil. Ölçülmeyen üçü —
 *   · `warehouse_unresolved` (aynı kod iki bölgede / kargo deposu yok) bizim yapılandırma
 *     hatamızdır ve zaten `captureError` ile `error_log`'a gidiyor; huniye yazılsaydı müşteri
 *     vazgeçmiş gibi görünürdü, oysa biz cevap verememişiz.
 *   · `order_not_placed` iç bir arıza, aynı gerekçe.
 *   · `date_unavailable` gerçek bir sürtünme ama enum'da karşılığı YOK; uydurmak yerine
 *     ölçmüyoruz. Karşılığı açılırsa tek satır (13.1'e bildirildi).
 */
function measureRejection(reason: string): void {
  // `price_changed` BİLEREK ölçülmüyor (07.13): `checkout_blocked` sebep kümesi tiplidir
  // (`AnalyticsBlockedReason` — `not_shippable · out_of_stock · min_basket`) ve zam o sözlüğün
  // konusu değil; müşteri engellenmiyor, onayı yenileniyor. Kümeye yeni bir değer eklemek
  // analitiğin şemasını (13.x) ilgilendirir — unutulduğu için değil, ait olmadığı için yok.
  const mapped =
    reason === 'blocked_lines'
      ? 'not_shippable'
      : reason === 'insufficient_here' || reason === 'insufficient_stock'
        ? 'out_of_stock'
        : null;
  if (mapped) void recordEvent({ type: 'checkout_blocked', reason: mapped });
}
