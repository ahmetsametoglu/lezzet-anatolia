import { AddressService, type Db } from '@lezzet/database';
import {
  resolveLocalizedText,
  type Address,
  type AddressDeliveryType,
  type LocalizedText,
  type PaymentMethod,
  type PreferredLanguage,
} from '@lezzet/types';
import { readPendingNeighborInvites } from '../customer/neighbor';
import { getCartView, type CartBundlePort } from '../cart/read';
import { orderScopeOf } from '../cart/cart-types';
import { cartFingerprint } from '../cart/fingerprint';
import type { CartDiscount, CartEntry, CartLine, DiscountReason } from '../cart/cart-types';
import { resolveCheckoutPayment } from './checkout-options';
import { quoteShipping } from '../shipping/quote';
import { sendcloudProvider, shippingProviderConfigured } from '../shipping/provider';
import type { ShippingRateProvider } from '../shipping/port';
import { readDeliveryInputs, resolveDelivery } from './delivery';

/**
 * Checkout ekranının ADIM VERİSİ (08.13) — **uygulama katmanı orkestrasyonu**.
 *
 * Üç kapıyı (adres → teslimat → sepet → ödeme) belirli bir SIRAYLA ve belirli kurallarla
 * birleştirir; sıranın da kuralların da her biri yaşanmış bir arızanın karşılığıdır ve künyelerinde
 * yazılıdır. Ekran bu birleşimi kendisi kuramaz (STACK §4) ve **iki yüzey de aynısını istiyor**:
 * web'in checkout adımı ile mobilin "Siparişi tamamla" ekranı aynı cevabı görmek zorunda — ikinci
 * kez yazılsaydı dört dersin dördü de bir gün ayrışırdı.
 *
 * ── TERFİ (aşama 2/3) · WEB'DEN FARKLARI ─────────────────────────────────────
 * Kaynağı `apps/web/app/(customer)/[locale]/checkout/actions.ts`'in `loadCheckoutAction`'ıydı; web
 * tarafı KÖPRÜ olarak duruyor. `'use server'` dosyası bir UÇTUR, orkestrasyon barındırmaz
 * (CLAUDE §2) — taşınmasının ikinci gerekçesi bu. Kural tarafında hiçbir şey değişmedi; değişen
 * yalnız kapının taşımayla bağını kesen dört şey:
 *   · `db` çağırandan gelir (`serviceDb()` içeride çağrılmıyor) — paketin ortak deseni.
 *   · **Kimlik ÇAĞIRANDAN gelir.** `currentCustomerId()` oturumu/çerezi okur ve pakette yaşayamaz:
 *     web köprüsü oturumdan çözüp geçer, mobil uç Bearer'dan. Girişsiz hâlin cevabı (boş liste)
 *     çağıranın işi — kapı kimliksiz çağrılmaz. Sepet niyeti (`entries`) de aynı sebeple parametre.
 *   · **Zarf ve dil doğrulaması WEB'te kaldı:** `try/catch` + `CustomerResult` + `hasLocale`.
 *     Burası adlı sonuç döndürür, fırlatmaz — hata sözlüğü müşteri yüzeyinin kendi sözlüğüdür.
 *   · Paket çözümü `bundles` kapısından gelir (aşama 1'in `CartBundlePort`u); bölge + depo
 *     listeleri bir kez okunup iki teslimat çözümüne birden veriliyor (web'de bunu `react.cache()`
 *     yapıyordu, istek kapsamı pakette yok).
 */

/** Özetin tek satırı — dökümde ve kapsam dışı listede aynı şekil (`kind`: paket satırı ayrı yazılır). */
export interface CheckoutSummaryLine {
  kind: 'variant' | 'bundle';
  name: string;
  qty: number;
  lineTotalCents: number | null;
}

/** Ekranın bir adımda ihtiyacı olan her şey — tek turda, çünkü üçü birbirine bağlı. */
export interface CheckoutSnapshot {
  addresses: Address[];
  /** Seçili adrese göre çözülmüş teslimat; adres seçilmemişse null. */
  delivery: {
    /** Checkout `pickup` üretemez — yerinde satışın adresi yok (`AddressDeliveryType`, 26.08). */
    deliveryType: AddressDeliveryType;
    availableDates: string[];
    requiresDateChoice: boolean;
    /**
     * **Komşu davetinin çağırdığı sefer** (17.10 · kullanıcı vurgusu 12.08) — `null` = davet yok
     * ya da bu adrese/güne uymuyor.
     *
     * Kullanıcının cümlesi: *"komşusunun seçtiği seferi göstermemiz lazım — komşunuz sizi bu sefere
     * davet etti diye. Bunun kaybolmaması lazım."* Ekran iki şey yapar: cümleyi kurar ve o günü
     * **önseçili** getirir. Önseçim şart, çünkü davetin tek işlevi o güne denk gelmek: davetli günü
     * kendi bulmak zorunda kalırsa ve bulamazsa davet hiçbir işe yaramaz — üstelik kimse fark etmez.
     *
     * Süzgeç burada: günü `availableDates` içinde OLMAYAN davet listeye girmez. Ekranda
     * seçilemeyen bir günü vaat etmek, müşteriyi bulamayacağı bir şeyi aramaya göndermektir.
     *
     * **LİSTE, TEK DEĞİL (kullanıcı kararı 21.08 · MB-61):** müşteriyi birden çok komşusu birden
     * çok güne çağırmış olabilir ve gün seçici her günün kendi davetini söylemeli. Gün başına en
     * fazla bir kayıt döner; aynı güne iki davet varsa kazanan SON KABUL EDİLENdir. Sözleşme
     * künyesi ayrıntıyı taşıyor (`checkout-api.schema` → `neighborInvites`).
     */
    neighborInvites: { inviteId: string; inviterName: string; deliveryDate: string }[];
    /** Rota dışı + soğuk zincir: sipariş verilemez, sepet bölünmeli (K32). */
    blocked: boolean;
  } | null;
  /** Ödeme seçenekleri + kargo + toplam; adres seçilmemişse null. */
  /**
   * **CANLI KARGO TEKLİFİ** (07.12) — yalnız kargo kulvarında dolu, rota siparişinde `null`.
   *
   * Liste sunucuda hesaplanır ve **fiyat istemciden ASLA kabul edilmez**: istemci yalnız hangi
   * `code`u seçtiğini söyler, tutar sipariş anında yeniden hesaplanır (`checkout-draft` aynı
   * kapıyı çağırır). Referans projede bunun tersi kayda geçmiş bir sömürü kapısıydı.
   *
   * `status` ekranın cümlesini belirler: teklif alınamadıysa sebebi söylenir ve sabit tarife
   * uygulandığı yazılır — sessiz geri düşüş yok.
   */
  shipping: {
    status: 'ok' | 'unmeasured' | 'no_box' | 'too_large' | 'no_sender' | 'provider_error' | 'off';
    options: ReadonlyArray<{
      code: string;
      carrierName: string;
      name: string;
      priceCents: number;
      leadTimeHours: number | null;
      lastMile: string | null;
      tracked: boolean;
    }>;
    /** Kaç kutuya bölünüyor — ekran "2 koli" diyebilsin diye. */
    parcelCount: number;
    selectedCode: string | null;
    /**
     * **Müşteriye seçim SORULUYOR mu** (kullanıcı kararı 29.08).
     *
     * - `customer` — kargo ücreti siparişin üzerine ekleniyor, yani parayı müşteri ödüyor:
     *   seçim onun ve teslimat noktası da meşru bir seçenek.
     * - `auto` — eşik geçildi, "ücretsiz kargo" diyoruz: parayı BİZ ödüyoruz, koli EVE gider ve
     *   müşteriye hiçbir şey sorulmaz. Sorsaydık ücreti hiç etkilemeyen bir soru sormuş olurduk.
     *
     * `auto` hâlinde `options` yine dolu gelir ama ekran onları ÇİZMEZ — liste operasyon
     * tarafında (`quoteOrderShipment`) hâlâ gerekli ve kural asıl orada bağlayıcı: müşterinin
     * seçtiği kod hiçbir yere yazılmıyor (ölçüldü 29.08), taşıyıcıyı sevk anında depo seçiyor.
     */
    mode: 'customer' | 'auto';
  } | null;
  payment: {
    methods: PaymentMethod[];
    creditAvailable: boolean;
    codBlockedReason: string | null;
    cashWarning: boolean;
    shippingFeeCents: number;
    shippingFreeReason: 'route' | 'threshold' | null;
    /**
     * Ücret NEREDEN geldi (07.12): `quote` canlı teklif · `tariff` sabit tarife · `null` ücret yok.
     * Ekran bunu SÖYLEMEK zorunda — teklif alınamadığında sessizce tarifeye düşmek, müşteriye
     * "canlı fiyat" diye hesaplanmamış bir sayı göstermek olurdu.
     */
    shippingFeeSource: 'quote' | 'tariff' | null;
    orderTotalCents: number;
    minBasketOk: boolean;
    missingForMinBasketCents: number;
    /**
     * Eşiklerin DAYANDIĞI yer — "67000 Strasbourg" (08.13).
     *
     * Asgari sepet bir sistem sabiti değil, **seçilen adresin bölgesinin** ayarıdır (kapsam:
     * depo → bölge → kanal → ülke → global). Sepet bu sayıyı ÇEREZTEKİ koda göre gösteriyor,
     * checkout ADRESE göre hesaplıyor; ikisi ayrı yere düşen müşteride sayı değişir ve sayıyı
     * yalnız başına gösteren cümle "az önce başka bir şey yazıyordu" hissi bırakır.
     *
     * Yer cümlenin İÇİNDE, ayrı bir uyarıda değil: fark çoğu müşteride hiç yaşanmaz, onu her
     * sepette anlatmak gürültü olurdu (08.30 kararı). Duvarın kendisi çıktığında ise sebebi
     * taşıması gerekiyor — ve yer her hâlde doğru bir bilgidir, fark olsun olmasın.
     *
     * "Fark var mı" ayrıca HESAPLANMADI ve bu bilinçli: çerez kapsamıyla ikinci bir ayar okuması,
     * ekranın gösterdiği sayının ikinci bir kaynağı olurdu — bir gün ötekiyle çelişirdi. Yer tek
     * kaynaktan (seçili adres) geliyor.
     */
    placeLabel: string;
  } | null;
  /**
   * **SİPARİŞİN ÖZETİ — ekranın çizeceği döküm** (kullanıcı kararı 21.08); adres seçilmemişse null.
   *
   * ── NEDEN SÖZLEŞMEYE GİRDİ ──────────────────────────────────────────────────
   * Anlık görüntü toplamı ZATEN buradaki kalemlerden hesaplıyordu (`orderScopeOf` → `scope`), ama
   * yalnız TOPLAMI döndürüyordu. İki ekran da dökümü kendi YEREL sepet kopyasından çiziyordu ve
   * ifade iki yere birebir kopyalanmıştı (`payment?.orderTotalCents ?? view.totalCents`). İkisi
   * ayrıştığı anda tek ekran iki sepet anlatıyor — cihazda ölçüldü (21.08): döküm 63,47 €
   * toplarken genel toplam 16,00 € yazıyordu, üstelik hangisinin doğru olduğunu söyleyen hiçbir
   * şey yoktu. (Doğru olan toplamdı; bayat olan listeydi.)
   *
   * Artık döküm ve toplam AYNI OKUMADAN geliyor. Ayrışma bir daha "olmasın diye dikkat edilen"
   * bir şey değil, YAPISAL OLARAK imkânsız: tek `getCartView` çağrısı, tek `scope`.
   *
   * ── KAPSAM: TAHSİL EDİLECEK KÜME ────────────────────────────────────────────
   * `lines`, taslağın gerçekten tahsil edeceği kümedir (`scope.lines`) — bu adrese hiç gelemeyen
   * kalemler DIŞARIDA kalır ve sepette bekler — onlar da `excludedLines`ta, ekran üstünü çizerek
   * gösterebilsin diye (dosyanın 10.08 kararı: ekran ile kasa aynı kümeyi göstermek zorunda).
   */
  summary: {
    lines: CheckoutSummaryLine[];
    /** İndirim ÖNCESİ ara toplam — asgari sepet eşiğinin ölçtüğü tutar (`orderScopeOf` künyesi). */
    subtotalCents: number;
    /**
     * Bu SİPARİŞE inen indirim; `null` = yok.
     *
     * Tutar sepetin toplam indirimi DEĞİL, kapsamdaki satırların payları kadardır
     * (`subtotalCents − basketCents`): siparişe girmeyen bir kalemin indirimi, tahsil edilecek
     * tutardan düşülemez.
     *
     * `label` seçili dilde çözülmüş kampanya adıdır; `null` ise ekran SEBEBİ yazar ("Kampanya ·
     * %8") — kural iki yüzeyde ortak ve istemcide duruyor (`discount-label` künyesi), burada
     * tekrarlanmaz.
     */
    discount: { amountCents: number; label: string | null; reason: DiscountReason | null } | null;
    /**
     * Siparişe GİRMEYEN, sepette kalan satırlar (soğuk zincir + rota dışı) — ekran onları üstü
     * çizili gösterir. Sayı değil satırların kendisi: ekranın adları yerel kopyasından okuması,
     * düzeltilen ayrışmayı özetin yarısında sürdürmek olurdu.
     */
    excludedLines: CheckoutSummaryLine[];
    /**
     * Bu özetin dayandığı sepetin içerik imzası (`cartFingerprint`).
     *
     * Onay çağrısı bunu geri gönderir; taslak sunucudaki sepeti yeniden okuyup karşılaştırır ve
     * farklıysa `cart_changed` ile reddeder. Ekranın son okuması ile onay dokunuşu arasındaki
     * boşluk ancak böyle kapanır — özet ne kadar taze olursa olsun o aralık her zaman vardır.
     */
    fingerprint: string;
  } | null;
}

export interface CheckoutSnapshotInput {
  /**
   * **Sunucuda çözülmüş** müşteri kimliği — istemciden ASLA alınmaz (`createCheckoutDraft` ile
   * aynı sözleşme). Girişsiz ziyaretçide kapı hiç çağrılmaz: cevabı (boş adres listesi) çağıranın
   * kendi yüzeyinde durur.
   */
  customerId: string;
  entries: readonly CartEntry[];
  /** Seçili adres; `null` ise varsayılan, o da yoksa ilk adres kullanılır. */
  addressId: string | null;
  /**
   * Sepette girilen kupon kodu — checkout'a KADAR taşınmalı. Taşınmadığında ekran kendisiyle
   * çelişiyordu: kalem satırları ve indirim sepet bağlamından (kuponlu), toplam ise buradan
   * (kuponsuz) geliyordu; üstelik siparişe yazılan tutar da kuponsuz oluyordu — müşteri kuponu
   * kullanmış görünüp TAM FİYAT ödüyordu (29.07 denetimi).
   */
  couponCode?: string | null;
  /**
   * Sepetin KARGO grubundan açılan ikinci sipariş mi (19.7 · `/checkout?group=shipping`).
   *
   * Taslakla AYNI bayrak, aynı gerekçe (`createCheckoutDraft` künyesi): tür türetilmez, açık
   * seçilir. Burada da geçmesi şart — geçmezse ekran adresin cevabını gösterir ("kapıya teslim,
   * kapıda ödeme mümkün, şu günler"), taslak ise kargo siparişi açar. Müşteri ekranda gördüğü
   * ödeme yöntemini seçer, onaylar ve kasada reddedilirdi.
   */
  shippingOrder?: boolean;
  /**
   * Müşterinin seçtiği kargo servisi (`code`). **Tutar İSTEMCİDEN ALINMAZ** — kod sunucudaki
   * teklif listesinde aranır ve fiyatı oradan okunur (07.12 kararı).
   */
  shippingOptionCode?: string | null;
  /** Kargo tarifesi sağlayıcısı — test sahte sağlayıcı geçirir, üretimde varsayılan kullanılır. */
  rateProvider?: ShippingRateProvider | null;
  /**
   * Paket çözümünün kapısı (`CartBundlePort`) — sepet okumasına olduğu gibi geçilir. Verilmezse
   * paket satırı ENGELLİ durur; sepette paket taşımayan yüzey bu kapıyı hiç geçmez.
   */
  bundles?: CartBundlePort;
}

/**
 * Adım verisini çözer. Adres seçilmeden de çağrılır (liste gelsin diye) — o zaman teslimat ve
 * ödeme null döner, çünkü ikisi de adresin cevabıdır ve adres yokken uydurulamaz.
 */
export async function readCheckoutSnapshot(
  db: Db,
  locale: PreferredLanguage,
  input: CheckoutSnapshotInput,
): Promise<CheckoutSnapshot> {
  const addresses = await new AddressService(db).listByCustomer(input.customerId);
  const selected = addresses.find((a) => a.id === input.addressId) ?? addresses.find((a) => a.isDefault) ?? addresses[0];
  if (!selected) return { addresses, delivery: null, shipping: null, payment: null, summary: null };

  // ── YER ÖNCE, SEPET SONRA (07.15'in kalanı, arka-uç talebi 09.08) ────────
  // Sepet yeri ÇEREZTEN alıyordu (`readPlaceWarehouses`) ve ayar kapsamının ülke/bölge eksenleri
  // hiç geçmiyordu: DE kargo tarifesi ve bölge asgari sepeti okunmuyor, FR/global değerler
  // kesiliyordu. Checkout'un yer kaynağı çerez DEĞİL **seçilen adrestir** — müşteri hangi adrese
  // gönderiyorsa eşik de oranın eşiğidir.
  //
  // İki tur `resolveDelivery` fazladan maliyet DEĞİL ve bunu kapının kendi künyesi söylüyor:
  // bölge/depo listeleri ortak ve tek okumadan geçiliyor, *"teslimat bir kez depoyu vermek, bir kez
  // de sepet bilindikten sonra kargo kararını vermek için iki kez çözülebiliyor."* Taslak
  // (`checkout-draft.ts`) aynı deseni zaten koşuyor — ekranın gösterdiği ile siparişi açanın
  // uyguladığı ancak böyle aynı hesaptan çıkar.
  const deliveryInputs = await readDeliveryInputs(db);
  const place = await resolveDelivery(db, {
    postalCode: selected.postalCode,
    country: selected.country,
    inputs: deliveryInputs,
  });
  const cart = await getCartView(db, locale, input.entries, {
    customerId: input.customerId,
    couponCode: input.couponCode,
    /* Bu alan BU SİPARİŞİN ÇIKACAĞI DEPOYU söyler — sepet ucunun kullandığı çözücüdeki "yalnız rota
       deposu" anlamı BURADA GEÇERLİ DEĞİL (ölçüldü 10.08). Taslak da aynısını geçiyor ve `route ===
       'local'` orada "bu siparişin deposundan karşılanıyor" demek oluyor; ayrıca fiyat/teklif
       çözümü de bu depodan okunuyor. Rota dışı adreste kargo deposu gelmesi bu yüzden doğrudur.
       Değiştirmeyi denedim, iki şeyi birden kırdı (fiyat çözülemedi, karşılanabilirlik kontrolü
       çöktü) — geri alındı. */
    warehouseId: place.warehouseId,
    shippingWarehouseId: place.shippingWarehouseId,
    country: selected.country,
    // Kargo siparişi bir BÖLGEYE ait değildir (taslakla aynı kural): rota bölgesi yalnız araçla
    // gidilen teslimatın kaydıdır, kargoda bölge eşiği uygulanmaz.
    zoneId: input.shippingOrder ? null : place.zoneId,
    bundles: input.bundles,
  });
  /* KAPSAM: EKRAN, TASLAĞIN TAHSİL EDECEĞİ KÜMEYİ GÖSTERİR (kullanıcı kararı 10.08).
     Bu adrese HİÇ gelemeyen kalemler (soğuk zincir + rota dışı) siparişin dışında kalıp sepette
     bekliyor (`orderableLines` — taslağın da kullandığı kapı). Anlık görüntü sepetin TAMAMINI
     okusaydı ekran ile kasa ayrışırdı: müşteri gelemeyen kalemi de içeren bir "Genel toplam"
     görür, siparişten daha azı kesilirdi — ve asgari sepet eşiği de sipariş edilemeyecek bir
     kalemle geçilmiş görünürdü. Taslak ile ekran AYNI sayıyı vermek zorunda. */
  const scope = orderScopeOf(cart, !input.shippingOrder && place.deliveryType === 'shipping');

  // İkinci tur: kargo kararı ancak sepet bilinince verilebilir (soğuk zincir kalemi var mı).
  const delivery = await resolveDelivery(db, {
    postalCode: selected.postalCode,
    country: selected.country,
    // Kapsam DIŞINDA kalan kalem kargo kararını da etkilememeli: siparişe girmeyen bir soğuk
    // zincir kalemi yüzünden kargo yolunu kapatmak, olmayan bir kısıtı uygulamaktır.
    hasNonShippableItem: scope.lines.some((l) => !l.shippable),
    inputs: deliveryInputs,
  });

  // Kargo siparişinde tür adresin cevabını EZER (19.15) ve gün hiç sorulmaz: tarih taşıyıcıya
  // bağlıdır, söz verilmez. Ezme tek yönlü — normal taslak adresin cevabını olduğu gibi kullanır.
  const deliveryType = input.shippingOrder ? ('shipping' as const) : delivery.deliveryType;

  /*
    ── CANLI KARGO TEKLİFİ (07.12) ─────────────────────────────────────────────
    Yalnız KARGO kulvarında sorulur: rota siparişinde taşıyıcı yok, tarife de yok.

    Sağlayıcı yapılandırılmamışsa ağa HİÇ çıkılmaz (`off`) — anahtarı olmayan bir kurulumda her
    checkout açılışında bir hata turu atmak, hem yavaşlık hem gürültüdür.

    Teklif düşerse sipariş yolu KAPANMAZ: `resolveShippingFee` sabit tarifeye düşer ve
    `shippingFeeSource: 'tariff'` ile bunu SÖYLER.
  */
  const rateProvider = input.rateProvider ?? (shippingProviderConfigured() ? sendcloudProvider() : null);
  // Kargo ÇIKIŞ deposu — rota deposu değil (19.23 ayrımı). Depo çözülemediyse teklif SORULMAZ:
  // gönderici olmadan tarife hesaplanamaz ve uydurma bir depodan sorulan fiyat yanlış olur.
  const quoteWarehouseId = place.shippingWarehouseId ?? place.warehouseId;
  const shipping =
    deliveryType === 'shipping' && rateProvider && quoteWarehouseId
      ? await quoteShipping(db, rateProvider, {
          warehouseId: quoteWarehouseId,
          to: { countryCode: selected.country, postalCode: selected.postalCode, city: selected.city ?? undefined },
          items: scope.lines.flatMap((l) => (l.variantId ? [{ variantId: l.variantId, qty: l.qty }] : [])),
        })
      : null;

  /*
    Seçilen servisin fiyatı SUNUCUDAN okunur — istemcinin gönderdiği tutar hiç sorulmaz.

    **ÖNSEÇİM DE SUNUCUDA** ve bu bir tur kazandırmıyor, bir ÇELİŞKİYİ önlüyor: istemci kendi
    önseçseydi ilk açılışta liste seçili görünür ama ücret hâlâ sabit tarifeden hesaplanmış
    olurdu — ekran "Chronopost 4,99 €" derken toplamda 11,90 € görünürdü. Sunucu seçince liste
    ve ücret aynı hesaptan çıkıyor.

    Seçim yoksa EN UCUZ: liste zaten ucuzdan pahalıya sıralı (`quoteShipping`). Müşteriye
    seçeneksiz bir "seçim" göstermek yerine en ucuzu işaretlemek, hem ücreti baştan doğru
    gösteriyor hem de değiştirme hakkını elinden almıyor.
  */
  const chosen =
    shipping?.status === 'ok'
      ? (shipping.options.find((o) => o.code === input.shippingOptionCode) ?? shipping.options[0] ?? null)
      : null;

  const options = await resolveCheckoutPayment(db, {
    customerId: input.customerId,
    deliveryType,
    quotedFeeCents: chosen?.priceCents ?? null,
    basketCents: scope.basketCents,
    // Asgari sepet eşiği İNDİRİM ÖNCESİNİ ister (kullanıcı kararı 11.08) — `basketCents` kargo ve
    // toplam içindir. Ayrımın tamamı `CheckoutPaymentInput` künyesinde.
    subtotalCents: scope.subtotalCents,
    // Oran satırın kendi gerçeğinden gelir (paketse kalemlerin en yükseği) — sabit yazmak
    // malzeme gibi %20'lik kalemlerde kargo KDV'sini yanlış bölerdi.
    lines: scope.lines.map((l) => ({ totalCents: l.lineTotalCents ?? 0, vatRate: l.vatRate })),
    /* AYAR KAPSAMI (07.15'in ikinci yarısı, 09.08) — üç eksen de sepet okumasına yukarıda ZATEN
       geçiyor; ödeme kapısına geçmiyordu. Ekran o hâlde kendi kendisiyle çelişiyordu: kalem bloğu
       kapsamlı eşiği, ödeme bloğu global eşiği gösteriyordu. Gerekçe ve ölçüm `checkout-draft.ts`in
       aynı çağrısında; taslakla ekran AYNI sayıyı vermek zorunda olduğu için ifadeler de aynı. */
    country: selected.country,
    zoneId: input.shippingOrder ? null : place.zoneId,
    warehouseId: place.warehouseId,
  });

  // Komşu daveti: kişiye yazılı kabuttan okunur (çerezden değil — 12.08 kararı). Kargo siparişinde
  // hiç sorulmaz: orada sefer diye bir şey yok.
  /* HEPSİ DÖNER, TEKİ DEĞİL (kullanıcı kararı 21.08): müşteriyi birden çok komşusu farklı günlere
     çağırmış olabilir ve ekran GÜN SEÇİCİDE her günün kendi davetini söylemeli — *"şu komşunuz
     sizi bu güne davet etti"*. Eskiden yalnız en yakın gün dönüyordu, ötekiler hiç görünmüyordu. */
  const pendingInvites = input.shippingOrder ? [] : await readPendingNeighborInvites(db, input.customerId);
  const matchingInvites = pendingInvites.filter(
    (invite) => invite.deliveryZoneId === place.zoneId && delivery.availableDates.includes(invite.deliveryDate),
  );

  return {
    addresses,
    delivery: {
      deliveryType,
      availableDates: input.shippingOrder ? [] : delivery.availableDates,
      requiresDateChoice: input.shippingOrder ? false : delivery.requiresDateChoice,
      neighborInvites: matchingInvites.map((invite) => ({
        inviteId: invite.inviteId,
        inviterName: invite.inviterName,
        deliveryDate: invite.deliveryDate,
      })),
      // Kargo siparişi soğuk zincir kalemi TAŞIYAMAZ — adres rota içinde olsa bile. Taslak
      // bunu ayrıca reddediyor (`cold_chain_unshippable`); ekran aynı gerçeği önce söyler.
      blocked: input.shippingOrder ? cart.lines.some((l) => !l.shippable) : delivery.shippingBlockedReason === 'cold_chain',
    },
    /* Kargo bloğu YALNIZ kargo kulvarında dolu (yukarıdaki künye). `off` = sağlayıcı
       yapılandırılmamış: ekran "canlı fiyat kapalı, sabit tarife geçerli" der. */
    shipping:
      shipping === null
        ? deliveryType === 'shipping'
          ? { status: 'off' as const, options: [], parcelCount: 0, selectedCode: null, mode: 'customer' as const }
          : null
        : {
            status: shipping.status,
            options:
              shipping.status === 'ok'
                ? shipping.options.map((o) => ({
                    code: o.code,
                    carrierName: o.carrierName,
                    name: o.name,
                    // Fiyatsız seçenek zaten `quoteShipping`te süzülüyor — burada tip daraltması.
                    priceCents: o.priceCents ?? 0,
                    leadTimeHours: o.leadTimeHours,
                    lastMile: o.lastMile,
                    tracked: o.tracked,
                  }))
                : [],
            parcelCount: shipping.status === 'ok' ? shipping.parcelCount : 0,
            selectedCode: chosen?.code ?? null,
            // Eşik geçildiyse ücret zaten sıfır: seçimin tutara etkisi YOK, o yüzden sorulmuyor.
            mode: options.shippingFreeReason === 'threshold' ? ('auto' as const) : ('customer' as const),
          },
    payment: {
      methods: options.methods,
      creditAvailable: options.creditAvailable,
      codBlockedReason: options.codBlockedReason,
      cashWarning: options.cashWarning,
      shippingFeeCents: options.shippingFeeCents,
      shippingFreeReason: options.shippingFreeReason,
      shippingFeeSource: options.shippingFeeSource,
      orderTotalCents: options.orderTotalCents,
      minBasketOk: options.minBasketOk,
      missingForMinBasketCents: options.missingForMinBasketCents,
      // Eşiği hangi yerin belirlediği: seçili adresin kendisi. Bölge ADI değil posta kodu +
      // şehir, çünkü müşteri kendi bölgemizin adını ("Strasbourg Merkez") bilmiyor — adresini
      // biliyor. `resolveDelivery` zaten bölge adını taşımıyor; ikinci bir okuma açmaya da
      // gerek yok.
      placeLabel: `${selected.postalCode} ${selected.city}`,
    },
    /* DÖKÜM VE TOPLAM AYNI OKUMADAN (kullanıcı kararı 21.08) — arayüzdeki `summary` künyesi
       gerekçenin tamamını taşıyor. Burada yeni bir hesap YOK: `scope` yukarıda zaten çözüldü ve
       `orderTotalCents` de ondan çıktı. Tek yaptığımız, ekranın kendi kopyasından çizmek zorunda
       kalmaması için o kümeyi de döndürmek. */
    summary: {
      lines: scope.lines.map(summaryLineOf),
      subtotalCents: scope.subtotalCents,
      // Kapsamın payı kadar — sepetin toplam indirimi değil (alan künyesi).
      discount: discountOf(cart.discount, scope.subtotalCents - scope.basketCents, locale),
      /* Kapsam dışında kalanlar: sepette olup siparişe girmeyenler. Karşılaştırma NESNE KİMLİĞİYLE
         (`includes`) — `orderScopeOf` süzgeci aynı dizinin elemanlarını döndürüyor, yani kimlik
         güvenilir ve ada/indekse dayanan bir eşleştirmeye gerek yok. */
      excludedLines: cart.lines.filter((l) => !scope.lines.includes(l)).map(summaryLineOf),
      fingerprint: cartFingerprint(input.entries),
    },
  };
}

/** Sepet satırı → özet satırı. Tek yerde, çünkü döküm ve kapsam dışı liste aynı şekli taşıyor. */
function summaryLineOf(line: CartLine): CheckoutSummaryLine {
  return { kind: line.kind, name: line.name, qty: line.qty, lineTotalCents: line.lineTotalCents };
}

/**
 * Sepet indiriminin ÖZET karşılığı — tutar kapsamdan, ad çok dilli alandan.
 *
 * `rejected` hâli de indirim TAŞIR (`appliedInsteadCents`): kupon tutmasa da sepete inen kampanya
 * yerinde durur ve künyesi `CartDiscount`ta yazılı — onu burada düşürmek, müşterinin hak ettiği
 * indirimi özetten silmek olurdu. Tutar yine de KAPSAMDAN okunur; `appliedInsteadCents` sepetin
 * tamamına aittir ve siparişe girmeyen kalemin payını da içerir.
 */
function discountOf(
  discount: CartDiscount,
  scopedCents: number,
  locale: PreferredLanguage,
): { amountCents: number; label: string | null; reason: DiscountReason | null } | null {
  if (scopedCents <= 0) return null;
  const label = (text: LocalizedText | null): string | null => (text === null ? null : resolveLocalizedText(text, locale));
  switch (discount.status) {
    /* Adı yoksa KOD yazılır — sepetin aynı kuralı (`discount-label` künyesi: "kupon tuttu:
       kampanyanın adı varsa o, yoksa müşterinin yazdığı KOD"). Kodu ayrı bir alan olarak taşımak
       yerine `label`a koyuyoruz çünkü alanın anlamı "müşterinin okuduğu künye"dir; o hâlde okuduğu
       şey gerçekten kodun kendisidir. */
    case 'applied':
      return { amountCents: scopedCents, label: label(discount.label) ?? discount.code, reason: null };
    case 'automatic':
      return { amountCents: scopedCents, label: label(discount.label), reason: discount.reason };
    case 'rejected':
      return discount.appliedInstead === null
        ? { amountCents: scopedCents, label: null, reason: null }
        : { amountCents: scopedCents, label: label(discount.appliedInstead.label), reason: discount.appliedInstead.reason };
    default:
      return null;
  }
}
