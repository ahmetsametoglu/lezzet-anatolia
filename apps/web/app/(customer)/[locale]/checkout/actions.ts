'use server';

import { AddressService, serviceDb } from '@lezzet/database';
import { hasLocale } from 'next-intl';
import { placeOrder, readCheckoutSnapshot, type CheckoutSnapshot, type PlaceOrderRejection } from '@lezzet/application';
import type { Address, AddressInsert, PaymentMethod } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { currentCustomerId } from '@/lib/guard';
import { updateAddress } from '@/lib/account/addresses';
import { CustomerError, customerErrorKey, type CustomerResult } from '@/lib/customer-error';
import { formatPrice } from '@/lib/storefront/format';
import type { CartEntry } from '@/lib/cart/cart-types';
import { getPackagesByIds } from '@/lib/storefront/packages';
import { resolveOrderLines } from '@/lib/order/customer-lines';
import { webOrderEffects } from '@/lib/order/transition';
import { stripeSessionCreator } from '@/lib/order/checkout-session';
import { rememberAcquisition } from '@/lib/analytics/attribution';
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

/**
 * Ekranın bir adımda ihtiyacı olan her şey — şekli artık `@lezzet/application`'da
 * (`order/checkout-snapshot`), okuması da orada. Buradan yeniden ihraç ediliyor ki ekranın
 * (`checkout-client`, `checkout-types`) bugünkü import yolu değişmesin.
 */
export type { CheckoutSnapshot };

/**
 * Adım verisini çözer. Adres seçilmeden de çağrılır (liste gelsin diye) — o zaman teslimat ve
 * ödeme null döner, çünkü ikisi de adresin cevabıdır ve adres yokken uydurulamaz.
 *
 * **Köprü** (sipariş zinciri terfisi, aşama 2/3): birleştirme kuralı `@lezzet/application`'a
 * taşındı — mobilin "Siparişi tamamla" ekranı tam da bu birleşimi istiyor ve `'use server'`
 * dosyası bir UÇTUR, orkestrasyon barındırmaz (CLAUDE §2). Uçta kalanlar: dil doğrulaması,
 * müşteri kimliğinin oturumdan çözülmesi (girişsizde boş cevap) ve müşteri hata zarfı.
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

    // Sıra, iki tur teslimat çözümü ve kargo siparişinin bölgesizliği — hepsi kapının kendi
    // künyesinde (`@lezzet/application`, `order/checkout-snapshot`). Uç yalnız kimliği çözer,
    // paket çözümünün kapısını geçer ve sonucu müşteri zarfına koyar.
    const data = await readCheckoutSnapshot(serviceDb(), locale, {
      customerId,
      entries,
      addressId,
      couponCode,
      shippingOrder,
      // Paket türetmesi hâlâ web'te (`lib/storefront/packages.ts`), terfisi ayrı bir adım — kapı
      // geçiliyor ki bugünkü paket davranışı birebir korunsun.
      bundles: getPackagesByIds,
    });
    return { data, errorKey: null };
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
 * Kapıda/vadeli ödemede sağlayıcıya hiç gidilmez ve sipariş kesinleşir (`confirmed`): beklenen bir
 * ödeme yok, bekletmenin de anlamı yok.
 *
 * **Köprü** (sipariş zinciri terfisi, aşama 3/3): zincirin tamamı `@lezzet/application`'ın
 * `order/place-order`ında — mobilin "Siparişi tamamla" ekranı aynı kapıyı çağıracak ve `'use
 * server'` dosyası bir UÇTUR, orkestrasyon barındırmaz (CLAUDE §2). Uçta kalanlar: dil doğrulaması,
 * kimliğin oturumdan çözülmesi, müşteri hata zarfı, **reddin ekran diline çevrilmesi**
 * (`rejectionOutcome` — para biçimi dile bağlı, bir görünüm kararı) ve dört yüzey portu (Stripe
 * üreteci · paket çözümü · edinim çerezi · huni defteri).
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
   * yalnız taslak açıyor; oradaki koruma açık taslakların süpürülmesi (kapının kendi adımı) ve
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

    // Zincirin TAMAMI kapının içinde (`@lezzet/application`, `order/place-order`): tekrar kalkanı,
    // açık taslakların süpürülmesi, taslak, çevrimdışı yolun rezervasyon → `confirmed` sırası ve
    // çevrimiçi yolun ödeme niyeti. Uç yalnız yüzeye ait dört şeyi geçirir — sağlayıcı üreteci,
    // paket çözümü, edinim çerezi ve ölçüm — sonra sonucu ekranın diline çevirir.
    const outcome = await placeOrder(serviceDb(), {
      locale: input.locale as Locale,
      customerId,
      entries: input.entries,
      addressId: input.addressId,
      deliveryDate: input.deliveryDate,
      paymentMethod: input.paymentMethod,
      onAccount: input.onAccount,
      marketingConsent: input.marketingConsent,
      couponCode: input.couponCode,
      idempotencyKey: input.idempotencyKey,
      shippingOrder: input.shippingOrder,
      // Paket türetmesi hâlâ web'te (`lib/storefront/packages.ts`), terfisi ayrı bir adım.
      bundles: getPackagesByIds,
      // Edinim kaynağı oturumun kampanya ÇEREZİNİ okur — taşıma ayrıntısı, pakette yaşayamaz.
      onCustomerAcquired: (id) => void rememberAcquisition(id),
      // Sağlayıcı istemcisi pakete GİRMEZ (`stripe` npm bağımlılığı): üreteç buradan geçer.
      createPaymentSession: stripeSessionCreator(),
      // Durum geçişinin iki yan etkisi (müşteri haberi + sipariş puanı) de web modüllerinde.
      effects: webOrderEffects,
      onRejected: measureRejection,
      // Huninin son adımı (08.9). Tutar ve müşteri TAŞINMAZ — olay yalnız "bu oturum siparişle
      // bitti" der (`ANALYTICS §1`, İlke 2'nin bilinçli istisnası).
      onPlaced: () => void recordEvent({ type: 'order_placed' }),
    });

    if (outcome.status === 'placed') {
      return { data: { status: 'placed', orderId: outcome.orderId, totalCents: outcome.totalCents }, errorKey: null };
    }
    if (outcome.status === 'payment_required') {
      return {
        data: {
          status: 'payment_required',
          orderId: outcome.orderId,
          clientSecret: outcome.clientSecret,
          totalCents: outcome.totalCents,
        },
        errorKey: null,
      };
    }
    return { data: await rejectionOutcome(outcome, input.locale), errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * Yapısal reddi EKRANIN diline çevirir — **ve bu bir görünüm kararıdır, o yüzden burada.**
 *
 * Kapı adlı ve yapısal döner (`{ status: 'price_changed', lines: [{ name, fromCents, toCents }] }`);
 * müşterinin gördüğü şey ise tek bir dize listesidir. Çeviri iki sebeple yüzeye ait: para biçimi
 * DİLE bağlı (`formatPrice` — "12,50 €" ile "€12.50" ayrımı bir kez tanımlı) ve mobil aynı reddi
 * kendi bileşenleriyle gösterecek. Şekil kapıda dursaydı iki yüzey aynı dizeyi paylaşmak zorunda
 * kalırdı.
 *
 * `detail`in tek biçim (dize listesi) olması bilinçli: ekran dört ayrı ret için tek bir liste
 * bileşeni gösteriyor (`rejectionMessage`).
 */
async function rejectionOutcome(rejection: PlaceOrderRejection, locale: Locale): Promise<ConfirmOutcome> {
  switch (rejection.status) {
    // Depo çözülemedi: sebep bir DİZE (ötekiler liste) — ekran onu tek satır gösteriyor. İz
    // (`captureError`) kapının içinde bırakıldı: bu bizim yapılandırma hatamız, hangi yüzeyden
    // gelirse gelsin aynı kovada görünmeli (`SOURCES.applicationOrder`).
    case 'warehouse_unresolved':
      return { status: 'rejected', reason: rejection.status, detail: rejection.reason };
    case 'blocked_lines':
      return { status: 'rejected', reason: rejection.status, detail: rejection.lines };
    // Ürünün adı YETMEZ, sayısı da gerekir: "Kayseri Mantısı" cümlesi müşteriye ne yapacağını
    // söylemiyor, "Kayseri Mantısı (2)" söylüyor. Parantezin ne anlama geldiğini metin yazıyor —
    // sunucu tarafında dil sözlüğü açmadan (`rejected.insufficient_here`).
    case 'insufficient_here':
      return { status: 'rejected', reason: rejection.status, detail: rejection.lines.map((l) => `${l.name} (${l.available})`) };
    case 'date_unavailable':
      return { status: 'rejected', reason: rejection.status, detail: rejection.availableDates };
    // Zamda ESKİ ve YENİ tutar BİRLİKTE taşınır (07.13): yalnız yeniyi göstermek müşteriyi "ne
    // kadar arttı" diye sepete geri döndürürdü. Biçimlendirici ekranınkiyle AYNI (`formatPrice`,
    // dile duyarlı), yani "12,50 €" ile "€12.50" ayrımı bir kez tanımlı.
    case 'price_changed':
      return {
        status: 'rejected',
        reason: rejection.status,
        detail: rejection.lines.map((l) => `${l.name}: ${formatPrice(l.fromCents, locale)} → ${formatPrice(l.toCents, locale)}`),
      };
    // Yarış hâli iki daldan da doğabilir (kapıda ödemenin ayırması / kartın ödeme oturumu) ve
    // künyesi aynı: kalem kimliği kapıdan gelir, ADI ekranın işidir.
    case 'insufficient_stock':
      return { status: 'rejected', reason: rejection.status, detail: await raceDetail(rejection, locale) };
    /**
     * Ödeme oturumu açılamadı. Ekranın sözlüğü sağlayıcı hâllerini adıyla tanıyor
     * (`rejected.provider_unavailable`, `rejected.stale`); tanımayanlar genel hata cümlesine düşer
     * (`rejectionMessage`'ın `?? t.pay.error` dalı) — `no_client_secret` de oraya düşüyor ve bu
     * doğru: "sağlayıcı jeton vermedi" müşteriye anlatılacak bir şey değil, bize kalan bir izdir.
     */
    case 'payment_unavailable':
      return { status: 'rejected', reason: rejection.reason };
    default:
      return { status: 'rejected', reason: rejection.status };
  }
}

/**
 * YARIŞ HÂLİNİN künyesi: hangi kalem, kaç tane kaldı (08.13'ün son kalanı).
 *
 * Sepet okumasıyla rezervasyon arasında stok düşerse — başka müşteri aldı — ekran *"Ürünlerden biri
 * bu arada tükendi"* diyordu. **Sepetinde on kalem olan müşteri hangisi olduğunu bulamıyor.**
 * Motor kimliği ve kalan adedi ZATEN döndürüyordu (`{ variantId, available }`); ekrana taşınmıyordu.
 *
 * Kardeşi `insufficient_here` bunu 19.7'de çözmüştü ve künyesi aynı cümleyi kuruyor: *"ürünün adı
 * YETMEZ, sayısı da gerekir."* Aynı biçim burada da geçerli — `Kayseri Mantısı (2)`.
 *
 * **Ad SEPETTEN değil VARYANTTAN çözülüyor** ve mecburen: bu hâl sepet okumasından SONRA doğuyor,
 * elde yalnız varyant kimliği var. `resolveOrderLines` müşteri yüzeyinin kendi kapısı — seçili dile
 * göre çözer (operasyonun `readVariantTitles`'ı Türkçe sabittir, o kullanılamazdı).
 *
 * **Ad bulunamazsa BOŞ liste** döner, uydurma bir metin değil: ürün silinmiş olabilir. Ekran o zaman
 * bugünkü genel cümleye düşer — eksik bilgi, yanlış bilgiden iyidir (`CLAUDE §1`).
 */
async function raceDetail(outcome: { variantId: string; available: number }, locale: string): Promise<string[] | undefined> {
  if (!hasLocale(routing.locales, locale)) return undefined;
  const lines = await resolveOrderLines(serviceDb(), [{ variantId: outcome.variantId }], locale);
  const name = lines.get(outcome.variantId)?.name;
  return name ? [`${name} (${outcome.available})`] : undefined;
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
 *
 * **Kapının `onRejected` PORTU budur** (terfi 3/3): paket hangi ret olduğunu söyler, neyin
 * sayılacağına yüzey karar verir. Defter çerez + oturum + istek başlığı okuyor, yani bir taşıma
 * ayrıntısı — mobil bu kapıyı hiç geçmeyecek.
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
        : // Ödeme oturumu açılamadı — enum'da KENDİ karşılığı var ve kapı onu adıyla veriyor.
          // (Eskiden bu olay zincirin içinden doğrudan atılıyordu; terfide tek kapıya toplandı.)
          reason === 'payment_failed'
          ? 'payment_failed'
          : null;
  if (mapped) void recordEvent({ type: 'checkout_blocked', reason: mapped });
}
