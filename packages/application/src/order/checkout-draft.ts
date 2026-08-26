import {
  AddressService,
  BundleItemService,
  CartService,
  OrderService,
  ProductService,
  ProductVariantService,
  UserProfileService,
  type Db,
} from '@lezzet/database';
import { cityMatchesPlaces, deriveChannel, meetsMinBasket, resolveVatTreatment } from '@lezzet/domain-core';
import { toCents } from '@lezzet/helper';
import type { AddressDeliveryType, LocalizedText, OrderItemInsert, PaymentMethod, PreferredLanguage } from '@lezzet/types';
import { getCartView, type CartBundlePort } from '../cart/read';
import { matchNeighborInviteForOrder } from '../customer/neighbor';
import { placesForPostalCode } from '../delivery/places';
import { cartFingerprint } from '../cart/fingerprint';
import {
  discountAmountOf,
  entryOf,
  itemOfEntry,
  orderScopeOf,
  storedPrices,
  type CartEntry,
  type CartLine,
  type CartView,
} from '../cart/cart-types';
import { resolveCheckoutPayment } from './checkout-options';
import { readDeliveryInputs, resolveDelivery } from './delivery';

/**
 * Sepet → TASLAK SİPARİŞ (07.4'ün eksik halkası) — **uygulama katmanı orkestrasyonu**.
 *
 * 07 modülünün checkout parçaları tek tek yazılmıştı ama her biri girdisinin HAZIR olduğunu
 * varsayıyordu: `resolveDelivery` posta kodunu, `resolveCheckoutPayment` sepet tutarını,
 * `createCheckoutSession` ise ortada duran bir `draft` siparişi. O taslağı doğuran yer hiç
 * yazılmamıştı — `OrderService.create` bugüne dek yalnız testlerden çağrılıyordu. Burası o yer.
 *
 * **Bağlayıcı fiyat BURADA sabitlenir** (DOMAIN §5). Sepetteki fiyat gösterimdir ve sepet aylarca
 * bekleyebilir; sipariş kalemine yazılan `unit_price` bu andaki çözümdür. Bu yüzden sepet
 * istemciden gelen tutarlarla değil, sunucuda YENİDEN okunur (`getCartView`).
 *
 * **İstemciden yalnız SEÇİMLER alınır** — adres, gün, ödeme yöntemi. Tutar, kargo ücreti, indirim
 * ve teslimat türü istemciden hiç kabul edilmez; hepsi burada çözülür. Aksi hâlde tarayıcı
 * konsolundan gönderilen bir `total` alanı siparişin parasını belirlerdi.
 *
 * **Her seçim yeniden DOĞRULANIR:** gönderilen gün gerçekten uygun günlerden biri mi, gönderilen
 * yöntem gerçekten açık yöntemlerden biri mi. Ekran doğru davranıyor diye sunucu güvenmez —
 * ekranın açık olduğu süre içinde bölge kapanmış, tavan değişmiş, ürün tükenmiş olabilir.
 *
 * ── TERFİ (aşama 2/3) · WEB'DEN FARKLARI ─────────────────────────────────────
 * Kaynağı `apps/web/lib/order/checkout-draft.ts`tı; web kopyası KÖPRÜ olarak duruyor. Sipariş
 * kuralı iki yüzeyde iki kez yaşayamaz: mobilin "Siparişi tamamla" ekranı da bu kapıyı çağıracak.
 * Kural tarafında hiçbir şey değişmedi — değişen yalnız kapının taşımayla bağını kesen dört şey:
 *   · `db` çağırandan gelir (`serviceDb()` içeride çağrılmıyor) — paketin ortak deseni.
 *   · **Edinim kaynağı bir KAPIYA çıktı** (`onCustomerAcquired`): web'deki `rememberAcquisition`
 *     oturum ÇEREZİNİ okuyor (`analytics/attribution`) ve çerez bir taşıma ayrıntısıdır — pakette
 *     yaşayamaz. Kapı opsiyonel: web köprüsü bugünkü davranışı korumak için geçer, mobil geçmez
 *     (mobilde kampanya oturumu kavramı yok, geçseydik uydurulmuş bir kaynak yazardık).
 *   · **Paket çözümü de bir KAPIDAN gelir** (`bundles`, `CartBundlePort` — aşama 1'in kapısı):
 *     paket türetmesi (stok/kargo/ağırlık) henüz `apps/web/lib/storefront/packages.ts`te ve terfisi
 *     ayrı bir adım. Web köprüsü kapıyı geçer, yani bugünkü paket davranışı BİREBİR korunur.
 *   · Bölge + depo listeleri BİR KEZ okunup iki teslimat çözümüne birden veriliyor (`inputs`).
 *     Web'de aynı işi `react.cache()`li ortak okuma yapıyordu; istek kapsamı pakette yok, ama
 *     tutarlılık ihtiyacı var — iki tur farklı liste görmemeli.
 */

export type CheckoutDraftOutcome =
  // Taslak bir ADRESTEN doğar — `pickup` üretemez (26.08, `AddressDeliveryType`).
  | { status: 'ok'; orderId: string; totalCents: number; deliveryType: AddressDeliveryType }
  /**
   * Yer çözülemedi: sipariş açılamaz. `ambiguous_zone` bir VERİ hatasıdır (aynı kod iki bölgede),
   * `no_shipping_warehouse` bir YAPILANDIRMA eksiğidir (kargo deposu yok). İkisi de müşteriye
   * "bölge dışısınız" dedirtmemeli — o başka bir şey; ekran operatöre haber verilmesini söyler.
   */
  | { status: 'warehouse_unresolved'; reason: 'ambiguous_zone' | 'no_shipping_warehouse' }
  | { status: 'empty_cart' }
  /** Tükenmiş/satışa kapanmış satır var — çıkarılmadan sipariş açılmaz. */
  | { status: 'blocked_lines'; lines: string[] }
  /**
   * Kalem bu depoda VAR ama sepetteki adet kadar yok (19.7 · kullanıcı bildirimi 02.08).
   *
   * `blocked_lines`ten ayrı, çünkü söylediği şey başka: orada kalem alınamıyor, burada AZI
   * alınabiliyor. Tek mesaja indirilseydi müşteri kalemi büsbütün silmeye kalkardı.
   *
   * Kontrol edilmezse iş rezervasyonda patlıyordu — müşteri adresini ve ödeme yöntemini seçip
   * "onayla"ya bastıktan sonra, üstelik hangi ürün olduğunu söylemeyen bir cümleyle. Adet burada
   * SESSİZCE düşürülmez: müşterinin yazdığı sayıyı haber vermeden değiştirmek, sepette kalemler
   * için yasakladığımız sessiz daralmanın ta kendisi. Sepet satırı tek tıkla düzeltiyor.
   */
  | { status: 'insufficient_here'; lines: { name: string; available: number }[] }
  | { status: 'min_basket'; missingCents: number }
  | { status: 'address_not_found' }
  /**
   * Adresin şehri, posta kodunun kapsadığı yerleşimlerden biri değil (19.17) — **rota siparişinde.**
   *
   * Yaşanmış bir arızanın kapısı: `67000` + `LINGOLSHEIM` rota + kapıda ödeme olarak açılmıştı,
   * oysa Lingolsheim'ın kodu `67380` ve o kod rotamızda yok. Kurye kapıya gidemez, operasyon
   * müşteriyi aramak zorunda kalır. Yolu belirleyen tek şey posta koduydu ve hiçbir yerde adresle
   * karşılaştırılmıyordu.
   *
   * Sipariş SESSİZCE kargoya çevrilmez: tür değişimi kargo ücretini ve açık ödeme yöntemlerini de
   * değiştirir, müşteri sebebini anlamadan başka bir siparişe bakar. Doğrusu durup söylemek —
   * `places` ekranın "şu olmalı" diyebilmesi için taşınır.
   */
  | { status: 'address_city_mismatch'; postalCode: string; city: string; places: string[] }
  /** Rota dışı adres + sepette soğuk zincir kalemi: ne kapıya ne kargoya. Sepet bölünmeli (K32). */
  | { status: 'cold_chain_unshippable' }
  | { status: 'date_unavailable'; availableDates: string[] }
  | { status: 'payment_not_allowed'; methods: PaymentMethod[] }
  /**
   * **Fiyat müşteriye SÖYLENDİĞİNDEN yüksek çıktı — onay yenilenmeden sipariş açılmaz** (07.13).
   *
   * DOMAIN §5'in kuralı asimetriktir: *artarsa bildirilir, düşerse sessiz uygulanır.* Zam
   * müşterinin onayını gerektirir, indirim sürpriz değil hediyedir. Kural sepette işliyordu
   * (`priceChangeOf` + `previousPrices`, testli) ama fiyatın **bağlayıcı olduğu** anda — taslak
   * açılırken — hiç sorulmuyordu: `createCheckoutDraft` sepeti `previousPrices` GEÇMEDEN okuyor,
   * reddetme hâlleri arasında da böyle bir hâl yoktu. Yani checkout ekranı açıkken teklif partisi
   * tükenirse sipariş tam fiyattan sessizce açılıyordu (ölçüldü 07.08).
   *
   * Kural dokümana Fransız tüketici hukuku gerekçesiyle girdi ve sessizce bozulması en pahalı
   * sınıf: hiçbir şey patlamaz, müşteri yalnız beklemediği bir tutar öder.
   */
  | { status: 'price_changed'; lines: { name: string; fromCents: number; toCents: number }[] }
  /**
   * **Sepet, müşteriye gösterildiğinden beri değişti** (kullanıcı kararı 21.08).
   *
   * Payload TAŞIMAZ ve bu bilinçli: `price_changed` neyin ne olduğunu söylemek zorunda (eski/yeni
   * fiyat ekranda yok), ama burada söylenecek şey EKRANIN KENDİSİDİR — özet yeniden okununca yeni
   * liste zaten görünür. Fark listesi üretmek, aynı gerçeği ikinci kez ve daha kötü anlatmak olurdu.
   */
  | { status: 'cart_changed' }
  | { status: 'customer_not_found' };

export interface CheckoutDraftInput {
  locale: PreferredLanguage;
  /**
   * **Sunucuda çözülmüş** müşteri kimliği — istemciden ASLA alınmaz.
   *
   * İki meşru kaynağı var ve ikisi de sunucudadır: girişli müşteride oturum (`requireAuth` →
   * `findByAuthUserId`), misafirde OTP doğrulamasından sonra sunucunun kendi yazdığı httpOnly
   * çerez (04.6). Kapı hangisinden geldiğini bilmez — bilmesi de gerekmez; onu çözmek çağıranın
   * işidir ve tek yerde (`checkout/actions.ts`) yapılır.
   */
  customerId: string;
  entries: readonly CartEntry[];
  addressId: string;
  /**
   * **ELLE GİRİŞ — bu taslağı bir müşteri değil PERSONEL açıyor** (09.8). Boş = müşteri yolu.
   *
   * Ayrı bir orkestrasyon YAZILMADI ve bu bilinçli bir seçim: telefonla gelen sipariş de KDV
   * işlemi, posta kodu → bölge → depo zinciri, tek-depo değişmezi, stok karşılanabilirliği,
   * rezervasyon ve indirim dengesi bakımından müşterinin açtığı siparişle **aynı** kurallara
   * tabidir. İkinci bir yol açmak o kuralların ikinci bir kopyasını doğururdu; ikisi bir gün
   * ayrışır ve ayrıştığı gün kimse fark etmezdi. Farklı olan yalnız aşağıdaki dört şey.
   */
  staff?: {
    /** Siparişi yazan personel — pazarlık izinin "kim" tarafı. */
    actorId: string;
    /**
     * Pazarlıklı birim fiyatlar (`variantId` → cent). Verilmeyen kalem liste fiyatından gider;
     * kural ve gerekçe `getCartView` künyesinde (tek sayı disiplini).
     */
    priceOverrides?: ReadonlyMap<string, number>;
    /** Patron ikramı — operasyon ve iç muhasebe tam normal, yalnız muhasebe export'una girmez (DOMAIN §9). */
    isGiftOrder?: boolean;
  };
  /** Rota içi teslimatta seçilen gün; kargoda null (tarih taşıyıcıya bağlı, söz verilmez). */
  deliveryDate: string | null;
  paymentMethod: PaymentMethod;
  /** Vadeli ("hesaba") satın alma — ödeme yöntemi değil, siparişin bayrağı. */
  onAccount?: boolean;
  couponCode?: string | null;
  /** Çift sipariş kalkanı (0015) — istemcinin o checkout denemesi için ürettiği anahtar. */
  idempotencyKey?: string | null;
  /**
   * **Müşteriye gösterilen sepetin imzası** — anlık görüntünün `summary.fingerprint`ı, ekrandan
   * olduğu gibi geri gelir (kullanıcı kararı 21.08).
   *
   * İstemcinin ÜRETTİĞİ bir değer değil, sunucunun verdiğinin yankısıdır: içeriği istemci
   * hesaplasaydı "ne gösterdiğini" istemciye yazdırmış olurduk. Boş bırakılabilir — o hâlde
   * kontrol atlanır (`cart_changed` künyesi).
   */
  expectedCartFingerprint?: string | null;
  // Komşu davetinin BELİRTECİ artık girdi DEĞİL (12.08 kararı): davet kimlik doğduğu an kişiye
  // yazılıyor (`neighbor_invite_claim`) ve sipariş anında müşterinin kendi kaydından okunuyor.
  // Belirteci buraya kadar taşımak, aynı gerçeği iki yerde tutmaktı — ve çerezi olmayan yüzey
  // (uygulama sonradan yüklendiğinde) daveti sessizce kaybederdi.
  /**
   * Bu taslak, sepetin KARGO grubundan açılan ikinci sipariş mi (19.15).
   *
   * ── NEDEN AÇIK BİR GİRDİ, TÜRETME DEĞİL ────────────────────────────────────
   * Taslak sepetin alt kümesini zaten alabiliyordu (`entries`), ama teslimatı ADRESTEN çözüyordu:
   * adres rota içindeyse zincir `route` + **rota deposunu** döndürür. Kargo grubunun kalemleriyle
   * açılan ikinci taslak böylece malın BULUNMADIĞI depodan bir rota siparişi üretirdi.
   *
   * Türetmek de yanlış olurdu ("kalemlerin hiçbiri yerelde yok, demek ki kargo"): aynı sepet iki
   * kez okunur ve arada stok değişirse ikinci taslak sessizce tür değiştirirdi. Yol AÇIK seçimdir,
   * varsayılanı yoktur (DOMAIN §17 / C2).
   *
   * `true` iken üç şey değişir: depo kargo deposudur, tür `shipping`'tir, gün seçilmez (kargoda
   * tarih taşıyıcıya bağlıdır ve söz verilmez). Ödeme kısıtı KENDİLİĞİNDEN düzelir — motor
   * `deliveryType === 'shipping'` görünce kapıda ödemeyi zaten kapatıyor (K37, doğrulandı).
   */
  shippingOrder?: boolean;
  /**
   * Paket çözümünün kapısı — sepet okumasının `CartBundlePort`u, olduğu gibi geçilir.
   *
   * Verilmezse paket satırı kimliğiyle ve ENGELLİ durur (aşama 1'in kararı): sepette paket
   * taşımayan yüzey (bugün mobil) bu kapıyı hiç geçmez. Web köprüsü geçer — bugünkü davranış
   * birebir korunsun diye.
   */
  bundles?: CartBundlePort;
  /**
   * Edinim kaynağı kapısı (13.2) — **web'e özgü olduğu için port.**
   *
   * Web'de bu iş `rememberAcquisition`tı ve oturumun kampanya künyesini ÇEREZTEN okuyordu; çerez
   * bir taşıma ayrıntısı, pakette yaşayamaz (aynı gerekçe `settingScopeOf`ün yer eksenlerini
   * dışarı çıkarmasında da geçerliydi: istek bağlamına bağlı bir okuma, orkestrasyonu istek dışında
   * ÇAĞRILAMAZ hâle getirir).
   *
   * **Beklenmez** (`void`): kaynak künyesi bir ölçümdür ve ölçüm akışı kesmez (`ANALYTICS §4`) —
   * siparişin açılmasını geciktirmemeli. Kapıyı geçen taraf kendi hatasını kendi yutar.
   */
  onCustomerAcquired?: (customerId: string) => void;
}

export async function createCheckoutDraft(db: Db, input: CheckoutDraftInput): Promise<CheckoutDraftOutcome> {
  const customer = await new UserProfileService(db).getById(input.customerId);
  if (!customer) return { status: 'customer_not_found' };

  // 1) Adres önce: teslimat türü de kargo ücreti de ondan çıkıyor. Adres MÜŞTERİNİN mi diye
  //    bakılır — kimlik istemciden geldiği için başkasının adresine sipariş açılabilirdi.
  const address = (await new AddressService(db).listByCustomer(customer.id)).find((a) => a.id === input.addressId);
  if (!address) return { status: 'address_not_found' };

  // ── KDV İŞLEMİ: KANAL + TESLİMAT ÜLKESİ (03.10 · DOMAIN §5) ───────────────
  // Motor (`resolveVatTreatment`) yazılıydı, testliydi ve HİÇBİR YERDEN ÇAĞRILMIYORDU: `vat_treatment`
  // kolonunu yazan tek şey `default 'domestic'`ti. Somut sonucu bir özellik eksiği değil, YANLIŞ
  // FATURAYDI — VIES ile doğrulanmış vergi numarası olan Alman B2B müşteriye Fransız KDV'si kesiliyor
  // ve faturaya "Autoliquidation" ibaresi girmiyordu; müşteri kendi ülkesinde beyan edemediği bir
  // KDV ödüyordu. Muhasebe dışa aktarımı (`accounting/export`) ve kâr hesabı bu kolonu ZATEN okuyor,
  // yani kayıt hep "yurt içi" diyordu.
  //
  // Ülke ADRESTEN gelir, müşterinin kimliğinden değil: belirleyen malın gittiği yerdir. Kanal ise
  // aşağıda siparişe yazılanla AYNI ifadeden çıkar — iki yerde ayrı türetilseydi biri bir gün
  // ötekinden ayrılır ve sipariş kendi KDV'siyle çelişirdi.
  const channel = deriveChannel({ isCompany: customer.type === 'company' });
  // `vatNumberValid` üç değerlidir (`null` = hiç sorulmadı) ve motor ancak `true`da reverse charge
  // dalını açar; `?? undefined` o üçüncü hâli motorun sözleşmesine çevirir — doğrulanmamış numara
  // %0 açmaz, çünkü yanlış %0 uygulamak bizim riskimizdir.
  const vat = resolveVatTreatment({
    channel,
    deliveryCountry: address.country,
    vatNumberValid: customer.vatNumberValid ?? undefined,
  });

  // Bölge + depo listeleri BİR KEZ okunur ve iki teslimat çözümüne birden verilir: iki tur farklı
  // liste görürse sipariş bir turun deposundan, öteki turun bölgesinden doğardı.
  const deliveryInputs = await readDeliveryInputs(db);

  // 2) DEPO önce: sepet hangi deponun stoğuyla okunacağını bilmek zorunda (19.9). Tasarımın
  //    "adres kazanır" kuralı burada uygulanır — seçilen adresin kodu şeritteki koddan farklıysa
  //    sepet o anda o adrese göre değerlendirilir, şerit yalnız bir varsayılandı.
  //
  //    Sıra döngüsel görünüyor (teslimat sepeti ister, sepet depoyu) ama değil: depo seçimi
  //    yalnız ADRESE bağlı, sepet yalnız "kargo da kapalı mı" kararını etkiliyor. O yüzden teslimat
  //    iki kez çözülüyor — girdileri tek okumadan geliyor, ikinci tur bedava.
  const place = await resolveDelivery(db, {
    postalCode: address.postalCode,
    country: address.country,
    inputs: deliveryInputs,
  });

  // Kargo siparişinde depo ADRESTEN değil, ülkenin kargo deposundan gelir (19.15): kalemler orada
  // duruyor, rota deposunda değil. Kargo deposu yoksa sipariş açılamaz ve sebebi ayrı söylenir —
  // bu bizim yapılandırma eksiğimizdir, müşterinin bölgesiyle ilgisi yok.
  const orderWarehouseId = input.shippingOrder ? place.shippingWarehouseId : place.warehouseId;
  if (input.shippingOrder && !orderWarehouseId) {
    return { status: 'warehouse_unresolved', reason: 'no_shipping_warehouse' };
  }

  // 3) Sepet SUNUCUDA yeniden okunur: bağlayıcı fiyat bu okumadan doğar. Depo bağlamıyla —
  //    aksi hâlde "sepette gördüm, ödemede kayboldu" sürprizi mümkün kalırdı.
  //
  //    Kargo siparişinde sepet KARGO deposuyla okunur: kalemlerin bulunduğu yer orası. Satırların
  //    `route`'u o hâlde `local` görünür ve bu bir çelişki değil — o alan "sepet ekranında hangi
  //    gruba düşüyor" sorusunun cevabıdır; burada grup zaten seçilmiş, sipariş türü ayrı taşınıyor.
  //
  //    **Saklanan fiyatlar okumadan ÖNCE alınır** (07.13, `writeCartAction` ile aynı sıra gerekçesi):
  //    karşılaştırmanın "önceki"si, müşterinin sepette en son GÖRDÜĞÜ ve sunucuya yazılmış fiyattır.
  //    Sonra okunsaydı karşılaştırma her zaman "değişmedi" derdi.
  const cartService = new CartService(db);
  const previousPrices = storedPrices((await cartService.get(customer.id)).items);
  const cart = await getCartView(db, input.locale, input.entries, {
    customerId: customer.id,
    couponCode: input.couponCode,
    // Pazarlıklı fiyatlar sepet okumasına GİRER, kalem yazımına değil: toplam, indirim matrahı,
    // KDV kırılımı ve kargo eşiği hep bu okumadan türüyor (09.8, künye `getCartView`de).
    priceOverrides: input.staff?.priceOverrides,
    warehouseId: orderWarehouseId,
    shippingWarehouseId: place.shippingWarehouseId,
    // ── AYAR KAPSAMININ ÜLKE VE BÖLGE EKSENLERİ (07.15) ───────────────────────
    // Yer zaten yukarıda çözülü (adım 2); sıra değişikliği bile gerekmedi. Bunlar geçmezse
    // kapsamlı ayarın iki ekseni boş kalıyor ve DE kargo tarifesi (12,90 €) ile bölge asgari
    // sepeti hiç okunmuyordu — FR/global değerler kesiliyordu.
    //
    // Ülke ADRESTEN, çerezten değil: sipariş hangi adrese gidiyorsa eşik de oranın eşiğidir.
    country: address.country,
    // **Kargo siparişi bir BÖLGEYE ait DEĞİLDİR** — aynı kural aşağıda taslak yazılırken
    // (`deliveryZoneId`) de yazılı: rota bölgesi yalnız araçla gidilen teslimatın kaydıdır. Adres
    // rota içinde olsa bile bu sipariş kargodur (19.15) ve bölgenin asgari sepeti ona uygulanamaz.
    zoneId: input.shippingOrder ? null : place.zoneId,
    previousPrices,
    bundles: input.bundles,
  });
  if (cart.lines.length === 0) return { status: 'empty_cart' };

  /* SEPET MÜŞTERİYE GÖSTERİLDİĞİNDEN BERİ DEĞİŞTİYSE — onay yenilenmeden sipariş açılmaz
     (kullanıcı kararı 21.08). `price_changed`ın kardeşi ve aynı gerekçeden doğdu; sırası da onun
     ÖNÜNDE, çünkü içerik değiştiyse fiyat karşılaştırması zaten başka bir sepeti anlatır.

     BOŞLUK NEREDEN: sepet SUNUCUDA yaşıyor ve iki yüzeyde paylaşılıyor — müşteri webde bir kalem
     çıkarırken telefonu ödeme adımında açık durabilir. Sipariş HER ZAMAN sunucudaki sepetten
     açıldığı için (`entries` yukarıda oradan geldi), müşteri gördüğü listeyi onaylayıp başka bir
     sipariş alabilirdi — sessizce. Ölçüldü (21.08, cihazda): ekran iki kalem listelerken sunucuda
     tek kalem vardı.

     İMZASIZ İSTEK REDDEDİLMEZ: alan isteğe bağlı ve boş gelirse kontrol atlanır. Zorunlu kılmak,
     sözleşmeyi bilmeyen her çağıranı (bugün web'in eski akışı, yarın bir başkası) sipariş
     veremez hâle getirirdi; kontrol imzayı GÖNDERENİ korur. */
  if (input.expectedCartFingerprint != null && input.expectedCartFingerprint !== cartFingerprint(input.entries)) {
    return { status: 'cart_changed' };
  }

  /* ── BU SİPARİŞİN KAPSAMI (kullanıcı kararı 10.08) ─────────────────────────
     Rota DIŞI adreste soğuk zincir kalemi hiçbir yoldan gidemez. Eskiden bu SİPARİŞİN TAMAMINI
     reddediyordu: gelebilecek beş kalem, gelemeyen biri yüzünden sipariş edilemiyordu. Artık
     gelemeyen kalem siparişin kapsamından DÜŞER — sepette kalmaya devam eder, çünkü müşteri yarın
     bölge içi bir adres eklerse o kalem yine lazım — ve ret yalnız geriye HİÇBİR kalem
     kalmadığında doğar (web'in `cold_chain_unshippable` testi tam da o hâli sınıyor).

     ÖLÇÜT `route`/`group` DEĞİL, satırın kendi `shippable`ı. Sebebi bu çağrının kendi künyesinde:
     buradaki `warehouseId` "siparişin çıkacağı depo"dur ve kalemler ona göre `local` görünür — grup
     burada "bu adrese gelemez"i söyleyemez. Adresin rota dışı olduğunu `place.deliveryType` söylüyor.
     (Denendi ve yanlış olduğu ölçüldü: depoyu rota deposuna çevirmek hem fiyat çözümünü hem
     karşılanabilirlik kontrolünü kırıyor.)

     KARGO SİPARİŞİ KAPSAM DIŞI: orada soğuk zincir kalemi zaten ayrıca reddediliyor (aşağıda) —
     sessizce düşürmek, müşterinin sepetine koyduğu ürünü haber vermeden siparişten çıkarmak olurdu.

     İNDİRİM PAYLARI SATIRLA BİRLİKTE SÜZÜLÜR: `discountSharesOf` KONUM dizisi döner; satırı süzüp
     payı süzmemek, kalan kalemlere başkasının indirimini yazardı. */
  const scope = orderScopeOf(cart, !input.shippingOrder && place.deliveryType === 'shipping');
  const orderedLines = scope.lines;
  const orderedShares = scope.shares;
  if (orderedLines.length === 0) return { status: 'cold_chain_unshippable' };

  // 4) Teslimat kararı tamamlanır: posta kodu → bölge → gün(ler). Soğuk zincir kalemi kargoyu kapatır.
  // Kapsam dışında kalan kalem kargo kararını da etkilemez: siparişe girmeyen bir soğuk zincir
  // kalemi yüzünden kargo yolunu kapatmak, olmayan bir kısıtı uygulamak olurdu.
  const hasNonShippableItem = orderedLines.some((l) => !l.shippable);
  const delivery = await resolveDelivery(db, {
    postalCode: address.postalCode,
    country: address.country,
    hasNonShippableItem,
    inputs: deliveryInputs,
  });

  // ── SİPARİŞİN TÜRÜ: KARGO SEÇİMİ ADRESİN CEVABINI EZER (19.15) ─────────────
  // Adres rota içinde olsa bile bu sipariş kargodur — kalemleri yerel depoda yok, kargo deposundan
  // gidiyor. Tür burada sabitlenir ve aşağıdaki her karar (ödeme yöntemleri, kargo ücreti, gün) onu
  // izler. Ezme TEK YÖNLÜDÜR: normal taslak adresin cevabını olduğu gibi kullanır.
  const deliveryType = input.shippingOrder ? ('shipping' as const) : delivery.deliveryType;

  // ── YAPISAL ENGEL, GEÇİCİ OLANDAN ÖNCE ────────────────────────────────────
  // Soğuk zincir kontrolü `blocked_lines`'tan ÖNCE gelir. Sepet artık depo bağlamıyla okunuyor
  // (adım 3) ve rota dışı adreste kargo deposunda bulunmayan soğuk zincir kalemi "şu an alınamıyor"
  // diye işaretleniyor — doğru ama YANILTICI cümle: müşteri stok beklemeye başlar, oysa o ürün o
  // adrese hiç gitmeyecek. Önce "gönderilemez" denir, sonra "şu an yok".
  // Kargo siparişi soğuk zincir kalemi TAŞIYAMAZ ve bu ayrıca kontrol edilir: `shippingBlockedReason`
  // yalnız rota DIŞI adreste doluyor (orada kargo tek yoldur). Rota İÇİ bir adresten açılan kargo
  // siparişinde o alan boş kalır — kontrol ona bırakılsaydı soğuk zincir ürün kargoya çıkardı.
  // ── ADRES KENDİYLE TUTARLI MI (19.17) ─────────────────────────────────────
  // Yalnız ROTA siparişinde sorulur ve sırası burası: yolu belirleyen posta kodudur, ama kapıya
  // giden kurye SOKAĞA gider. Kod ile şehir farklı yerleri gösteriyorsa ikisinden biri yanlıştır ve
  // hangisi olduğunu biz bilemeyiz — o yüzden düzeltmiyoruz, soruyoruz. Kargoda sorulmaz: paketi
  // taşıyıcı taşır ve adresi o doğrular; bizim reddimiz orada boşa sürtünme olurdu.
  //
  // Kural KAPIDA, formda değil: form istemcidedir ve atlanabilir. Form aynı şeyi erken söyler
  // (müşteri ödemeye gelmeden düzeltsin) ama tek başına bir kapı değildir.
  if (deliveryType === 'route') {
    const places = await placesForPostalCode(db, address.country, address.postalCode);
    if (!cityMatchesPlaces(address.city, places)) {
      return { status: 'address_city_mismatch', postalCode: address.postalCode, city: address.city, places };
    }
  }

  if (input.shippingOrder && hasNonShippableItem) return { status: 'cold_chain_unshippable' };
  if (delivery.shippingBlockedReason === 'cold_chain') return { status: 'cold_chain_unshippable' };
  if (cart.hasBlocked) return { status: 'blocked_lines', lines: cart.lines.filter((l) => l.blocked).map((l) => l.name) };

  // ── BU SİPARİŞİN DEPOSUNDA KARŞILANAMAYAN KALEM (19.15) ───────────────────
  // `blocked` bu soruyu artık cevaplamıyor ve cevaplamamalı: 19.10 onu daralttı — kargoyla
  // gelebilen ürün "tükendi" değildir (C3) ve sepette satılabilir görünür. Ama BU sipariş tek bir
  // depodan çıkıyor (K5); o depoda bulunmayan kalem buraya giremez, yoksa taslak açılır ve iş
  // rezervasyon aşamasında, müşteri ödemeye geçtikten sonra patlar.
  //
  // Ayrımın yeri burası: sepet "alınabilir mi" sorusunu yanıtlar, checkout "bu siparişle gelir mi".
  const unfulfillable = orderedLines.filter((l) => l.route !== null && l.route !== 'local');
  if (unfulfillable.length > 0) return { status: 'blocked_lines', lines: unfulfillable.map((l) => l.name) };

  // ── ADET DE KARŞILANMALI (19.7) ───────────────────────────────────────────
  // Yukarıdaki süzgeç "kalem bu depoda var mı" sorusunu cevaplıyor, "kaç tane var" sorusunu değil.
  // Cevaplanmadığında iş rezervasyonda patlıyordu: müşteri ödeme yöntemini seçmiş, "onayla"ya
  // basmış, ve aldığı cevap ürünü adlandırmayan bir "bir ürün tükendi" oluyordu — oysa tükenen bir
  // şey yok, o adrese istenen adet gitmiyor. Sayı sepetin gösterdiğiyle aynı kaynaktan (`availableHere`).
  const overCap = orderedLines.filter((l) => l.availableHere !== null && l.availableHere < l.qty);
  if (overCap.length > 0) {
    return { status: 'insufficient_here', lines: overCap.map((l) => ({ name: l.name, available: l.availableHere ?? 0 })) };
  }
  /* Eşik SİPARİŞE GİREN tutara bakar: gelemeyen bir kalemle asgari sepeti geçmiş görünen müşteri
     kasada geri düşerdi. `cart.minBasketOk` sepetin TAMAMINI ölçüyor; kapsam daraldığında ölçüm de
     daralmalı. Eşiğin kendisi yine sunucunun (kapsamlı ayar) — burada yalnız matrah değişiyor. */
  /* ASGARİ SEPET PERSONEL YOLUNDA SORULMAZ (09.8). Eşiğin amacı kendi kendine sipariş veren
     müşteriyi kârsız bir teslimattan çevirmektir — telefondaki müşteriyi zaten operatör
     karşılıyor ve küçük siparişi alıp almamak onun kararı. Kapı burada kalsaydı operatör
     "sistem izin vermiyor" diyerek bir satışı reddetmek zorunda kalırdı; teslimat maliyeti
     kararı ise fiyatı elle yazabilen kişinin verebileceği bir karardır. */
  const basket = meetsMinBasket(scope.subtotalCents, cart.minBasketCents);
  if (!input.staff && !basket.ok) return { status: 'min_basket', missingCents: basket.missingCents };

  // Gün DOĞRULANIR, kabul edilmez: ekran açıkken kesim saati geçmiş ya da bölge günü değişmiş olabilir.
  // Kargo siparişinde gün HİÇ sorulmaz: tarih taşıyıcıya bağlıdır ve söz verilmez.
  if (deliveryType === 'route') {
    const chosen = input.deliveryDate ?? (delivery.availableDates.length === 1 ? delivery.availableDates[0]! : null);
    if (!chosen || !delivery.availableDates.includes(chosen)) {
      return { status: 'date_unavailable', availableDates: delivery.availableDates };
    }
  }

  // 4) Ödeme seçenekleri + kargo ücreti + KDV kırılımı. Kalem oranları kalem kalem geçilir:
  //    kargonun KDV'si taşıdığı malın oranını izler, tek oran varsaymak karışık sepette yanlış.
  // Reverse charge'da kalem oranı SIFIRLANIR: `zeroRated` "ürünün kendi oranı geçerli değil"
  // demektir. Kargonun KDV'si taşıdığı malın oranını izlediği için (`apportionShippingVat`) ücret
  // de kendiliğinden sıfırlanır — ayrıca sıfırlamak, aynı kuralın ikinci bir tanımı olurdu.
  const items = await expandToOrderItems(db, orderedLines, orderedShares, vat.zeroRated, input.staff?.actorId ?? null);
  const options = await resolveCheckoutPayment(db, {
    customerId: customer.id,
    deliveryType,
    basketCents: scope.basketCents,
    // Asgari sepet eşiği İNDİRİM ÖNCESİNİ ister (kullanıcı kararı 11.08) — `basketCents` kargo ve
    // toplam içindir. Ayrımın tamamı `CheckoutPaymentInput` künyesinde.
    subtotalCents: scope.subtotalCents,
    lines: items.map((i) => ({ totalCents: i.unitPriceCents * i.qty, vatRate: i.vatRate })),
    /* ── AYAR KAPSAMI BURADA DA GEÇER (07.15'in ikinci yarısı, 09.08) ─────────
       Üç eksen de sepet okumasına ZATEN geçiliyordu (yukarıda, adım 3) ama ödeme kapısına
       geçmiyordu ve alanlar girdide duruyordu. Sonuç sessiz bir ÇELİŞKİYDİ: sepet bloğu kapsamlı
       ayarı okuyor, **siparişe yazılan kargo ücreti** global/FR değeri okuyordu.

       Ölçüldü (yerel veri, 09.08): `shipping_fee_cents` global 7,90 € ⟷ **country=DE 12,90 €**;
       `free_shipping_threshold_cents` global 60 € ⟷ DE 90 € ⟷ **channel=b2b 250 €**;
       `min_basket_cents` **channel=b2b 120 €** ⟷ **zone=Illkirch/Ostwald 45 €**. Yani Alman
       müşteriye 5 € eksik kargo kesiliyor, toptancının 120 €'luk asgari sepeti hiç uygulanmıyordu.

       Bu, `settings-keys` künyesinin anlattığı arızanın aynısı (sepette bir sayı, kasada başka bir
       sayı) — orada anahtar ortaklığıyla kapatılmış, burada kapsam ortaklığıyla kapanıyor. Değerler
       uydurulmadı: üçü de sepet okumasına verilen ifadelerin TA KENDİSİ. */
    country: address.country,
    // Kargo siparişi bir BÖLGEYE ait değildir (yukarıdaki aynı kural, aynı ifade).
    zoneId: input.shippingOrder ? null : place.zoneId,
    warehouseId: orderWarehouseId,
  });
  if (!options.methods.includes(input.paymentMethod)) {
    return { status: 'payment_not_allowed', methods: options.methods };
  }

  // Depo çözülemediyse sipariş AÇILMAZ: deposuz bir sipariş şemada da yazılamaz (not null) ve
  // yazılabilseydi hangi depodan hazırlanacağı bilinmeyen bir kayıt kalırdı. Sebep çağırana
  // taşınır — "bölge dışısınız" ile "kargo deposu tanımlı değil" aynı cümle olamaz.
  if (!orderWarehouseId) {
    return { status: 'warehouse_unresolved', reason: delivery.unresolvedReason ?? 'no_shipping_warehouse' };
  }

  /**
   * **Zam ONAY İSTER — ve bu kapı en sonda** (07.13).
   *
   * Yeri bilinçli: sırası gelmemiş bir onay sormak anlamsızdır. Kalemi alınamayan, günü kapanmış
   * ya da ödeme yöntemi reddedilen bir sipariş zaten açılmayacak; müşteriye önce "şu fiyatı kabul
   * eder misin" deyip ardından "zaten olmuyor" demek, iki kez durdurmak olurdu.
   *
   * **Reddederken saklanan fiyatlar GÜNCELLENİR** ve bu şart, süs değil: karşılaştırmanın "önceki"si
   * sunucu sepetindeki fiyat ve onu yalnız `writeCartAction` tazeliyor. Yazmasaydık müşteri
   * uyarıyı okuyup tekrar "onayla"ya bastığında aynı reddi alırdı — sonsuz döngü. Yazınca kural
   * sepettekiyle birebir aynı davranışa oturuyor: **bir kez bildir, sonra sakla.**
   *
   * Düşen fiyat buraya HİÇ gelmez (`priceChangeOf` yalnız artışta işaret koyar) — indirimi
   * onaylatmak müşteriyi hediyesi için durdurmak olurdu.
   */
  // Onay yalnız SİPARİŞE GİREN kalemin zammı için istenir: siparişe girmeyen bir kalemin fiyatını
  // onaylatmak, müşteriyi almadığı bir şey için durdurmak olurdu. Saklanan fiyatlar yine sepetin
  // TAMAMI için tazelenir (aşağıda) — sepet o kalemleri taşımaya devam ediyor.
  const raised = orderedLines.filter((l) => l.priceChange);
  if (raised.length > 0) {
    await cartService.replace(
      customer.id,
      cart.lines.map((l) => itemOfEntry(entryOf(l), (l.unitPriceCents ?? 0) / 100)),
    );
    return {
      status: 'price_changed',
      lines: raised.map((l) => ({
        name: l.name,
        fromCents: l.priceChange!.previousCents,
        toCents: l.unitPriceCents ?? 0,
      })),
    };
  }

  // 5) Taslak. Kanal müşteri tipinden TÜRER ve bir daha değişmez (DOMAIN §3); adres ANLIK GÖRÜNTÜ
  //    olarak da yazılır — müşteri adresini sonradan düzenlerse sipariş nereye gittiğini unutmamalı.
  const deliveryDate = deliveryType === 'route' ? (input.deliveryDate ?? delivery.availableDates[0] ?? null) : null;
  const orderZoneId = input.shippingOrder ? null : delivery.zoneId;

  // Komşu daveti (17.10) — kaynağı artık ÇEREZ DEĞİL, kişiye yazılmış kabul kaydı (12.08 kararı):
  // davet kimlik doğduğu an kişiye geçiyor, sipariş anında sorulacak yer onun kendi kaydı. Ancak
  // SEFER belli olduktan sonra sorulabilir; ret sessiz ve sonuçsuzdur, künye yazılmaz.
  const neighborInviteId = await matchedNeighborInviteId(db, {
    customerId: customer.id,
    deliveryZoneId: orderZoneId,
    deliveryDate,
  });

  const { order } = await new OrderService(db).create(
    {
      customerId: customer.id,
      // Sipariş TEK depodan çıkar (DOMAIN §17) ve kaynağı ADRESİN posta kodudur — uzaktan siparişte
      // varsayılan depo kavramı yoktur (C2). Yer çözümü teslimat kararıyla aynı turda yapıldı.
      warehouseId: orderWarehouseId,
      channel,
      // Kaynak YÜZEYİ söyler, kanaldan bağımsız ayrı eksendir (DATA_MODEL). Telefonla gelip
      // masada yazılan sipariş `manual`dır; WhatsApp köprüsü (15.4) kendi kaynağını geçirecek.
      orderSource: input.staff ? 'manual' : 'web',
      // Patron ikramı (DOMAIN §9) — yalnız personel yolundan işaretlenebilir.
      isGiftOrder: input.staff?.isGiftOrder ?? false,
      status: 'draft',
      idempotencyKey: input.idempotencyKey ?? null,
      paymentMethod: input.paymentMethod,
      onAccount: input.onAccount ?? false,
      deliveryType,
      // Kargo siparişi bir BÖLGEYE ait değildir: rota bölgesi yalnız araçla gidilen teslimatın kaydı.
      deliveryZoneId: orderZoneId,
      deliveryDate,
      neighborInviteId,
      addressId: address.id,
      addressSnapshot: { ...address },
      deliveryCountry: address.country,
      vatTreatment: vat.treatment,
      // **Vergi numarasının o ANKİ kopyası** — yalnız %0 uygulandığında (kolonun künyesi: "reverse
      // charge'da o anki geçerli no, denetim kanıtı"). Müşteri numarasını sonradan değiştirse ya da
      // silse bile, altı ay sonra bir denetçi "bu siparişte neden KDV kesilmemiş" diye sorduğunda
      // cevap siparişin kendisinde durur — `addressSnapshot` ile aynı kural.
      vatNumberSnapshot: vat.zeroRated ? customer.vatNumber : null,
      // Servis cent alıyor (02.9): iki `fromCents` kalktı, motorun çıktısı doğrudan gidiyor.
      shippingFeeCents: options.shippingFeeCents,
      totalCents: options.orderTotalCents,
      // Paylaşılan fonksiyon (denetim A1): yerel bir kopya vardı ve `rejected` hâlinde 0 dönüyordu.
      // Sepet toplamı zaten paylaşılanı kullanıyor, yani tahsilat doğruydu — ama deftere "indirim
      // verilmedi" yazılıyordu. Kupon reddedilip yerine otomatik kampanya indiğinde müşteri
      // indirimli ödüyor, kayıt sıfır gösteriyordu: marj ve kampanya raporu ikisi de yanlış okunur.
      discountAmountCents: discountAmountOf(cart.discount),
      discountId: discountIdOf(cart),
      discountLabel: discountLabelOf(cart),
      // Siparişin dili: müşteri bu siparişi hangi yüzeyde okuyorsa o. Mailler buradan konuşur.
      locale: input.locale,
    },
    items,
    // Kupon KOTASI siparişle birlikte tükenir (`OrderService.create`); buradan geçen tek şey hangi
    // KAPIDAN girildiği — kotayı bölmez, "hangi dil karşılık buldu" sorusunu yanıtlar.
    { discountCodeId: discountCodeIdOf(cart) },
  );

  // Edinim kaynağı (13.2) — oturumun kampanya künyesi müşteriye kopyalanır, YALNIZ alan boşsa.
  //
  // **Neden burası, `createCheckoutSession` değil:** checkout'un iki ödeme dalı var (online / kapıda
  // ya da vadeli) ve ikincisi ödeme oturumunu hiç açmıyor. Kaynağı orada yazsaydık nakit ve vadeli
  // müşterilerin tamamı sessizce "kaynağı ölçülmemiş" kalırdı — B2B'nin ana yolu tam olarak o dal.
  // Taslak ise iki dalın da geçtiği tek nokta ve "onayla"ya basılmış an demek; niyet bellidir.
  //
  // Beklenmez: kampanya künyesi bir ölçümdür, siparişin açılmasını geciktirmemeli. Kapıyı geçmeyen
  // yüzeyde (mobil) hiçbir şey olmaz — uydurulmuş bir kaynak yazmaktansa boş kalması doğrudur.
  input.onCustomerAcquired?.(customer.id);

  return { status: 'ok', orderId: order.id, totalCents: options.orderTotalCents, deliveryType };
}

/**
 * Sepet satırları → sipariş kalemleri. **Paket burada PARÇALANIR.**
 *
 * Müşteri tek bir "Bayram Sofrası" satırı görür ve öyle de görmeli (DOMAIN §13: satılan şey paketin
 * kendisidir). Ama sipariş varyant kalemlerinden oluşur — depo raftan paket değil ürün toplar, stok
 * varyanttan düşer, kâr varyant maliyetinden çıkar. Bu yüzden kalem `bundle_id` taşır: nereden
 * geldiği kaybolmaz, iade ve rapor paketi yeniden kurabilir.
 *
 * **Birim fiyat paketin PAYIDIR, katalog fiyatı değil.** Katalog fiyatı yazılsaydı kalemler toplamı
 * paketin fiyatını aşar ve sipariş kendi toplamıyla çelişirdi — indirim tam da o farktır.
 *
 * **İndirim payı kaleme YAZILIR** (`shares`, kalem sırasıyla hizalı — bkz. `discountSharesOf`).
 * Başlıktaki `discount_amount` tek başına yetmiyor: ödeme durumunu türeten motor "müşteri ne kadar
 * borçlu" sorusunu KALEMLERDEN topluyor (`derivePaymentStatus`) ve payı 0 gördüğü sürece indirimi
 * ödenmemiş bakiye sayıyor.
 */
async function expandToOrderItems(
  db: Db,
  lines: readonly CartLine[],
  shares: readonly number[],
  /** Reverse charge (`vat.zeroRated`) — kalem oranı ürünün kendi oranı DEĞİL, sıfırdır. */
  zeroRated: boolean,
  /** Pazarlığı yapan personel (09.8); `null` = müşteri yolu, iz yazılmaz. */
  priceSetBy: string | null,
): Promise<Omit<OrderItemInsert, 'orderId'>[]> {
  const items = new BundleItemService(db);
  const bundleItems = new Map(
    await Promise.all(
      lines.filter((l) => l.kind === 'bundle').map(async (l) => [l.bundleId, await items.listByBundle(l.bundleId)] as const),
    ),
  );

  // KDV oranı ÜRÜNÜN alanı, varyantın değil — varyantlar önce ürünlerine bağlanır. Tek turda:
  // kalem başına sorgu, üç kalemlik bir pakette bile N+1 doğururdu.
  const variantIds = [
    ...lines.filter((l) => l.kind === 'variant').map((l) => l.variantId),
    ...[...bundleItems.values()].flat().map((i) => i.variantId),
  ];
  const variants = await new ProductVariantService(db).listByIds([...new Set(variantIds)]);
  const products = await new ProductService(db).listByIds([...new Set(variants.map((v) => v.productId))]);
  const vatByProduct = new Map(products.map((p) => [p.id, p.vatRate]));
  // Sıfırlama HARİTANIN kendisinde: kalem ve paket parçası aynı haritadan okuyor, iki çağrı yerine
  // ayrı ayrı koşul yazsaydık biri bir gün ötekinden ayrılır ve paketli sipariş KDV'li kalırdı.
  const vatByVariant = new Map(variants.map((v) => [v.id, zeroRated ? 0 : (vatByProduct.get(v.productId) ?? 0)]));

  const rows: Omit<OrderItemInsert, 'orderId'>[] = [];
  lines.forEach((line, index) => {
    if (line.kind === 'variant') {
      rows.push({
        variantId: line.variantId,
        qty: line.qty,
        stockId: line.stockId,
        bundleId: null,
        unitPriceCents: line.unitPriceCents ?? 0,
        // PAZARLIK İZİ (09.8) — ikisi BİRLİKTE yazılır, kısıt veride (`order_item_negotiation_complete`).
        // Satır pazarlık taşımıyorsa ikisi de `null`: eşit sayı yazmak kayda "indirim verildi"
        // dedirtirdi ve her normal checkout kalemi sahte bir taviz kaydı taşırdı.
        listUnitPriceCents: line.listUnitPriceCents ?? null,
        priceSetBy: line.listUnitPriceCents != null ? priceSetBy : null,
        vatRate: vatByVariant.get(line.variantId) ?? 0,
        lineDiscountAmountCents: shares[index] ?? 0,
      });
      return;
    }
    for (const item of bundleItems.get(line.bundleId) ?? []) {
      rows.push({
        variantId: item.variantId,
        // Paketin adedi kalemin adedini ÇARPAR: iki "Bayram Sofrası" iki kat malzeme demektir.
        qty: item.qty * line.qty,
        stockId: null,
        bundleId: line.bundleId,
        // `Bundle.allocatedUnitPrice` hâlâ euro — paket ailesi göçmedi (02.9'un listesinde yoktu,
        // görev satırına eklendi). Çevrim burada, ortak `toCents` ile.
        unitPriceCents: toCents(item.allocatedUnitPrice),
        vatRate: vatByVariant.get(item.variantId) ?? 0,
        // Pakete sepet indirimi BİNMEZ (DOMAIN §13) — motor da payını 0 dağıtır. Paketin kendi
        // indirimi zaten birim fiyatın içinde.
        lineDiscountAmountCents: 0,
      });
    }
  });
  return rows;
}

/**
 * İndirimin kalem payları — **sepet satırlarıyla index index hizalı** (`../cart/read.ts` her
 * satır için tam bir kayıt gönderir, muaf olanı bile: dizi hizası bunun için korunuyor).
 *
 * İndirim yoksa boş dizi döner ve her kalem 0 pay alır. `Σ pay = discount_amount` motorun
 * garantisidir (`distributeDiscount`) — burada yeniden bölüştürme YAPILMAZ, yapılsaydı kuruş
 * artığı iki yerde farklı yuvarlanır ve sipariş kendi toplamıyla çelişirdi.
 *
 * **Reddedilen kuponda da pay vardır** (denetim A1): kupon tutmasa bile sepette kazanan bir
 * kampanya olabilir ve müşteri onu kaybetmez. Payları yok saymak, başlıkta 4 € indirim yazıp
 * kalemlere 0 dağıtmak olurdu — veritabanı bunu zaten reddediyor.
 */

/**
 * Kuponun girildiği KAPI (`discount_code.id`) — yalnız `applied` hâlde vardır.
 *
 * Otomatik kampanyada kod yoktur; `outranked` hâlde kazanan otomatik kampanyadır, yani girilen kodun
 * kapısı da tutmamıştır — kullanım kaydına yazılacak bir kapı yok. Kaydı yine de yazsaydık,
 * uygulanmamış bir kodu "karşılık buldu" diye sayardık.
 */
function discountCodeIdOf(cart: { discount: { status: string; codeId?: string } }): string | null {
  return cart.discount.status === 'applied' ? (cart.discount.codeId ?? null) : null;
}

function discountIdOf(cart: { discount: { status: string; discountId?: string | null } }): string | null {
  return cart.discount.status === 'applied' || cart.discount.status === 'automatic' ? (cart.discount.discountId ?? null) : null;
}

/**
 * İndirimin müşteriye görünen adının SİPARİŞ ANINDAKİ kopyası (0015 `discount_label`).
 *
 * `discountId` üzerinden sonradan okumak yetmezdi: kampanya yeniden adlandırılabilir, süresi
 * dolabilir, silinebilir. O zaman altı ay önce gönderilmiş mailin yeniden basımı başka bir şey
 * derdi. Siparişe ait olan bilgi siparişte durur — `addressSnapshot` ile aynı kural.
 */
function discountLabelOf(cart: CartView): LocalizedText | null {
  return cart.discount.status === 'applied' || cart.discount.status === 'automatic' ? cart.discount.label : null;
}

/**
 * Bu siparişin seferine uyan kabul edilmiş komşu daveti — kimlik ya da `null` (17.10 · 12.08).
 *
 * Eşleşmeme SEBEBİ taşınmıyor ve bu bilinçli: hiçbiri siparişi durdurmuyor ve hiçbiri müşteriye
 * gösterilmiyor — ödeme adımında "davetin tutmadı" demek ilgisiz bir kaygı yaratırdı. Sebep
 * gerekirse davetin kendi karşılama sayfasında görülür; orada söylenecek yer var.
 *
 * Beklenmedik hata da siparişi düşürmez: davet bir kolaylıktır, ödeme değil.
 */
async function matchedNeighborInviteId(
  db: Db,
  input: { customerId: string; deliveryZoneId: string | null; deliveryDate: string | null },
): Promise<string | null> {
  try {
    return await matchNeighborInviteForOrder(db, input);
  } catch {
    // Yalnız ödeme akışını ayakta tutmak için — davetin kendi yolu zaten iz bırakıyor ve ikinci
    // bir log satırı aynı olayı iki kez anlatırdı.
    return null;
  }
}
