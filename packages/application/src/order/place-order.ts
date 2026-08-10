import { OrderService, ReservationService, type Db } from '@lezzet/database';
import { captureError, SOURCES } from '@lezzet/observability';
import type { DeliveryType, OrderCancelReason, PaymentMethod, PreferredLanguage } from '@lezzet/types';
import { clearOrderedLines } from '../cart/settle';
import type { CartBundlePort } from '../cart/read';
import type { CartEntry } from '../cart/cart-types';
import { createCheckoutDraft, type CheckoutDraftOutcome } from './checkout-draft';
import { createCheckoutSession, type CheckoutSessionCreator } from './checkout-session';
import { reserveOrderStock } from './reserve';
import { transitionOrder } from './transition';
import type { OrderEffects } from './effects';

/**
 * "Siparişi onayla" — **taslağı açar, stoğu ayırır, ödeme niyetini doğurur** (uygulama katmanı
 * orkestrasyonu).
 *
 * **Tek turda** olması bilinçli: taslağı ayrı bir çağrıda açsaydık, ödeme adımına hiç gelmeyen
 * müşteriler ardında yetim taslaklar bırakırdı. Burada üçü tek karar: ya hepsi olur ya hiçbiri.
 *
 * Online ödemede `clientSecret` döner ve kart onayı **istemcide** verilir (Stripe iframe'i);
 * sipariş ödeme onayına kadar `draft` kalır ("önce ayır, sonra tahsil et").
 * Kapıda/vadeli ödemede sağlayıcıya hiç gidilmez ve sipariş BURADA kesinleşir (`confirmed`):
 * beklenen bir ödeme yok, bekletmenin de anlamı yok.
 *
 * ── TERFİ (aşama 3/3) · WEB'DEN FARKLARI ─────────────────────────────────────
 * Kaynağı `apps/web/app/(customer)/[locale]/checkout/actions.ts`'in `confirmCheckoutAction`ıydı;
 * web tarafı KÖPRÜ olarak duruyor. İki gerekçe: mobilin "Siparişi tamamla" ekranı tam bu zinciri
 * çağıracak ve **iki yüzeyde iki sipariş kuralı olamaz**; ayrıca `'use server'` dosyası bir UÇTUR,
 * orkestrasyon barındırmaz (CLAUDE §2). Kural tarafında hiçbir şey değişmedi — değişen, kapının
 * taşımaya ve YÜZEYE bağını kesen dört şey:
 *
 * · **Sağlayıcı istemcisi PORT** (`createPaymentSession`): `stripe` npm paketi bu paketin
 *   bağımlılığı olamaz (React Native tarafından da okunabilen bir ağaçta yaşıyoruz). Web köprüsü
 *   bugünkü Stripe üretecini geçer, mobil arka uç kendi istemcisini geçecek. `null` = anahtar yok.
 *
 * · **Ret DETAYININ biçimlenmesi ÇAĞIRANDA.** Burası ADLI ve YAPISAL sonuç döner
 *   (`{ status: 'price_changed', lines: [{ name, fromCents, toCents }] }`); onu *"Baklava: 12,50 €
 *   → 13,00 €"* dizesine çeviren şey bir GÖRÜNÜM kararıdır — para biçimi dile bağlı (`formatPrice`)
 *   ve iki yüzeyde iki farklı bileşen. Şekil mobil sözleşmesine (`CheckoutOrderResultSchema`)
 *   bilerek yakın tutuldu: taslağın ret hâlleri oraya birebir düşüyor.
 *
 * · **Ölçüm PORT** (`onRejected` / `onPlaced`): web'in huni defteri çerez + oturum + istek başlığı
 *   okuyor (`analytics/record`), yani bir taşıma ayrıntısı. Kapılar opsiyonel ve **beklenmez**:
 *   ölçüm akışı kesmez (`ANALYTICS §4`). Web köprüsü bugünkü iki çağrıyı geçer; mobil geçmez —
 *   uydurulmuş bir oturum, huniyi sessizce bozardı.
 *
 * · **Durum geçişinin yan etkileri PORT** (`effects`, `transitionOrder` üstünden): müşteri haberi
 *   ve sipariş puanı başka modüllerin dosyaları, gerekçesi `effects.ts` künyesinde.
 */

/**
 * Sipariş açılamadı — ve **her ret müşteriden BAŞKA bir şey ister**: `blocked_lines` satır
 * çıkarmayı, `insufficient_here` adet düşürmeyi, `price_changed` yeni fiyatı onaylamayı,
 * `date_unavailable` başka gün seçmeyi. Tek "olmadı"ya indirgenseydi müşteri neyi düzelteceğini
 * bilemez, çoğu sepeti büsbütün terk ederdi.
 *
 * Taslağın ret hâlleri OLDUĞU GİBİ taşınır (`CheckoutDraftOutcome` eksi `ok`) — burada yeniden
 * sayılsalardı iki liste bir gün ayrışırdı. Üstüne bu zincirin kendi üç hâli biner.
 */
export type PlaceOrderRejection =
  | Exclude<CheckoutDraftOutcome, { status: 'ok' }>
  /**
   * YARIŞ HÂLİ: sepet okumasıyla rezervasyon arasında stok düştü — başka müşteri aldı. Kalem
   * kimliği ve kalan adet taşınır; ADI çağıran çözer (dil onun, sözlüğü onun). İki daldan da
   * doğabilir: kapıda/vadeli ödemede `confirmed` ayırmasından, kartta ödeme oturumundan.
   */
  | { status: 'insufficient_stock'; variantId: string; available: number }
  /**
   * Ödeme oturumu açılamadı — müşteri her şeyi doğru yaptı, kasa açılmadı. Huninin son adımındaki
   * kayıpların en pahalısı bu.
   *
   * `no_client_secret` ayrı bir hâl: sağlayıcı "oldu" dedi ama istemcinin ödemeyi tamamlaması için
   * gereken jetonu vermedi. Ödeme başlatılamaz, yani sonucu ötekilerle aynı.
   *
   * **Kartın REDDİ burada DEĞİL** ve bilerek: o karar sağlayıcının kendi arayüzünde veriliyor,
   * sunucuya hiç uğramıyor.
   */
  | { status: 'payment_unavailable'; reason: 'stale' | 'not_found' | 'provider_unavailable' | 'no_client_secret' }
  /** Taslak açıldı ama kesinleşemedi (sipariş okunamadı ya da geçişi motor reddetti) — iç arıza. */
  | { status: 'order_not_placed' };

export type PlaceOrderOutcome =
  /** Kart yolu: sipariş `draft`, ödeme istemcide tamamlanacak. */
  | { status: 'payment_required'; orderId: string; totalCents: number; deliveryType: DeliveryType; clientSecret: string }
  /** Kapıda/vadeli: ödeme sağlayıcısı yok, sipariş AÇILDI ve kesinleşti. */
  | { status: 'placed'; orderId: string; totalCents: number; deliveryType: DeliveryType }
  | PlaceOrderRejection;

export interface PlaceOrderInput {
  locale: PreferredLanguage;
  /**
   * **Sunucuda çözülmüş** müşteri kimliği — istemciden ASLA alınmaz (`createCheckoutDraft` ile aynı
   * sözleşme). Web oturumdan çözer, mobil uç Bearer'dan.
   */
  customerId: string;
  entries: readonly CartEntry[];
  addressId: string;
  deliveryDate: string | null;
  paymentMethod: PaymentMethod;
  onAccount?: boolean;
  /** Bülten/pazarlama izni — checkout kutusundan gelir, baştan işaretsizdir (DOMAIN §11). */
  marketingConsent?: boolean;
  /** Sepetteki kupon kodu; siparişin indirimi bunsuz hesaplanamaz. */
  couponCode?: string | null;
  /**
   * Çift sipariş kalkanı — istemcinin bu checkout denemesi için ürettiği anahtar.
   *
   * Kapsam BİLEREK dar: yalnız kart DIŞI yollarda işler. Orada sipariş bu çağrıda kesinleşiyor,
   * yani ikinci bir çağrı **kalıcı ve gerçek** bir çift sipariş demek. Kart yolunda ise çağrı
   * yalnız taslak açıyor; oradaki koruma açık taslakların süpürülmesi ve düğmenin gezinme bitene
   * kadar kapalı kalması.
   */
  idempotencyKey?: string | null;
  /** Sepetin kargo grubundan açılan ikinci sipariş mi — anlık görüntüyle AYNI bayrak (19.15). */
  shippingOrder?: boolean;
  /** Paket çözümünün kapısı — taslağa olduğu gibi geçilir (aşama 1'in `CartBundlePort`u). */
  bundles?: CartBundlePort;
  /** Edinim kaynağı kapısı (13.2) — taslağa olduğu gibi geçilir; web'de çerez okur. */
  onCustomerAcquired?: (customerId: string) => void;
  /**
   * Ödeme niyetini açan sağlayıcı. **Zorunlu ve varsayılansız**: `null` "anahtar yok" demektir ve
   * cevabı `provider_unavailable`dır. Varsayılan verseydik paketin `stripe`a bağımlı olması
   * gerekirdi — bu zincirin taşınmasının tek teknik kısıtı buydu.
   */
  createPaymentSession: CheckoutSessionCreator | null;
  /** Durum geçişinin yan etkileri (müşteri haberi + sipariş puanı) — `transitionOrder`a geçer. */
  effects?: OrderEffects;
  /**
   * Huni ölçümü: sipariş REDDEDİLDİ. Değer, ret hâlinin adıdır; ödeme oturumu düşmesinde
   * `payment_failed`. Çağıran neyin sayılacağına kendi karar verir (bazı retler bizim
   * yapılandırma hatamızdır ve huniye yazılmamalıdır — müşteri vazgeçmedi, biz cevap veremedik).
   */
  onRejected?: (reason: string) => void;
  /** Huni ölçümü: müşteri siparişi verdi (kart yolunda "ödemeye bastı" niyeti de buraya sayılır). */
  onPlaced?: () => void;
}

export async function placeOrder(db: Db, input: PlaceOrderInput): Promise<PlaceOrderOutcome> {
  /**
   * Aynı istek İKİNCİ kez geldiyse (çift tıklama, ağın yeniden denemesi) ikinci sipariş AÇILMAZ:
   * var olanın kimliği döner. Kart dışı yollarda sipariş bu çağrıda kesinleştiği için buradaki
   * tekrar, kalıcı bir çift sipariş demekti.
   *
   * Huni ölçümü BURADA atılmaz ve bu doğru: ölçülen şey müşterinin NİYETİdir, o niyet ilk çağrıda
   * zaten sayıldı — ikinci kez saymak aynı siparişi iki niyet göstermek olurdu.
   */
  if (input.idempotencyKey) {
    const already = await new OrderService(db).findByIdempotencyKey(input.idempotencyKey, input.customerId);
    if (already && already.status !== 'draft' && already.status !== 'cancelled') {
      return { status: 'placed', orderId: already.id, totalCents: already.totalCents, deliveryType: already.deliveryType };
    }
  }

  // Önceki deneme(ler)den kalan açık taslak KAPATILIR — yenisini açmadan önce.
  await supersedeOpenDrafts(db, input.customerId);

  const draft = await createCheckoutDraft(db, {
    locale: input.locale,
    customerId: input.customerId,
    entries: input.entries,
    addressId: input.addressId,
    deliveryDate: input.deliveryDate,
    paymentMethod: input.paymentMethod,
    onAccount: input.onAccount,
    couponCode: input.couponCode,
    idempotencyKey: input.idempotencyKey,
    shippingOrder: input.shippingOrder,
    bundles: input.bundles,
    onCustomerAcquired: input.onCustomerAcquired,
  });

  if (draft.status !== 'ok') {
    // Depo çözülemedi: iki sebep de siparişi engeller ama biri VERİ hatası (aynı kod iki bölgede),
    // öteki YAPILANDIRMA eksiği (kargo deposu yok). İkisi de operatörün müdahalesini bekler ve
    // müşteri bunu "ödeme hatası" olarak görmemeli — sebep çağırana taşınır, iz de bırakılır.
    if (draft.status === 'warehouse_unresolved') {
      // Log'a KİMLİK yazılır, içerik yazılmaz (CLAUDE.md §1): sebep ve müşteri kimliği yeter —
      // adres satırı ya da posta kodu kişisel veridir ve teşhis için gerekmez.
      await captureError(new Error(`checkout: yer çözülemedi (${draft.reason})`), {
        source: SOURCES.applicationOrder,
        context: { reason: draft.reason, customerId: input.customerId },
      });
      // Huniye YAZILMAZ (bilerek): bu bizim yapılandırma hatamız, müşterinin sürtünmesi değil.
      return draft;
    }
    input.onRejected?.(draft.status);
    return draft;
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
    const placed = await new OrderService(db).getWithItems(draft.orderId);
    if (!placed) return { status: 'order_not_placed' };

    const reserved = await reserveOrderStock(db, { orderId: draft.orderId, items: placed.items, expiring: false });
    if (!reserved.ok) {
      // Ayrılamadıysa sipariş taslak kalır ve kapatılır: müşteriye söz verilmemiş olur.
      // Sebep `out_of_stock` — gerçekten mal kalmadı. **Bu yolda PARA HİÇ ÇEKİLMEDİ** (kapıda/vadeli
      // ödeme, sipariş `draft`): ekranın "iade edildi" cümlesi bu sebebi tek başına okuyarak
      // kurulamaz, ödeme yöntemiyle birlikte okunur (`confirmation-types` künyesi, 07.14).
      await cancelDraft(db, draft.orderId, 'out_of_stock');
      input.onRejected?.('insufficient_stock');
      return { status: 'insufficient_stock', variantId: reserved.variantId, available: reserved.available };
    }

    const moved = await transitionOrder(db, { orderId: draft.orderId, to: 'confirmed', effects: input.effects });
    if (moved.status !== 'ok') {
      await releaseOrderStock(db, draft.orderId);
      // Sebep `null` ve bilerek: geçiş motorca reddedildi — kümedeki beş sebepten hiçbiri bunu
      // anlatmıyor. Uydurulmuş bir sebep, ekranı yanlış cümleye götürürdü; `null` "sebep
      // yazılmadı" der ve ekran nötr cümleye düşer.
      await cancelDraft(db, draft.orderId, null);
      return { status: 'order_not_placed' };
    }

    // Sipariş kesinleşti → sepetten O SİPARİŞİN kalemleri düşer. Toptan boşaltmak, iki gruplu
    // sepette kapıya siparişini veren müşterinin kargo grubunu da sessizce silerdi (19.7).
    await clearOrderedLines(db, input.customerId, draft.orderId);
    // Huninin son adımı (08.9). Tutar ve müşteri TAŞINMAZ — olay yalnız "bu oturum siparişle
    // bitti" der (`ANALYTICS §1`, İlke 2'nin bilinçli istisnası).
    input.onPlaced?.();
    return { status: 'placed', orderId: draft.orderId, totalCents: draft.totalCents, deliveryType: draft.deliveryType };
  }

  const session = await createCheckoutSession(
    db,
    { orderId: draft.orderId, marketingConsent: input.marketingConsent },
    input.createPaymentSession,
  );
  if (session.status !== 'ok' || !session.clientSecret) {
    // Ödeme oturumu açılamadı: müşteri her şeyi doğru yaptı, kasa açılmadı. Huninin son
    // adımındaki kayıpların en pahalısı bu — sepet ve adres tamam, ödeme yolu yok.
    //
    // **Kartın REDDİ burada değil** ve bilerek: o karar sağlayıcının kendi arayüzünde veriliyor,
    // sunucuya hiç uğramıyor. Ölçmek için istemciden çağrılabilir ikinci bir yazma ucu açmak
    // gerekirdi (haritanın tek istisnası paylaşma) — üstelik red sebepleri zaten sağlayıcının
    // panosunda, bizden daha ayrıntılı duruyor.
    input.onRejected?.('payment_failed');
    // Yarış hâli bu dalda da doğabilir (`createCheckoutSession` ayırmayı kendi içinde yapıyor) ve
    // künyesi kapıda ödeme yoluyla AYNI: kalem kimliği elimizde, adı çağıranın işi.
    if (session.status === 'insufficient_stock') {
      return { status: 'insufficient_stock', variantId: session.variantId, available: session.available };
    }
    return {
      status: 'payment_unavailable',
      // `ok` ama jetonsuz hâl ayrı adlandırılır: "oturum açılamadı" ile "oturum açıldı ama ödeme
      // başlatılamaz" ayrı arızalardır ve tek ada indirilirse ikincisi hiç görünmez.
      reason: session.status === 'ok' ? 'no_client_secret' : session.status,
    };
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
  input.onPlaced?.();
  return {
    status: 'payment_required',
    orderId: draft.orderId,
    totalCents: draft.totalCents,
    deliveryType: draft.deliveryType,
    clientSecret: session.clientSecret,
  };
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
async function supersedeOpenDrafts(db: Db, customerId: string): Promise<void> {
  const orders = new OrderService(db);
  // Taslaklar en yenilerdir: sayfanın başı yeter, tüm geçmişi taramaya gerek yok.
  const recent = await orders.listByCustomer(customerId, { limit: 20 });
  for (const order of recent.rows) {
    if (order.status !== 'draft') continue;
    // Sıra ÖNEMLİ: önce mal geri bırakılır, sonra sipariş kapanır. Tersi olsaydı iptal edilmiş bir
    // siparişin rezervasyonu ortada kalabilirdi.
    await releaseOrderStock(db, order.id);
    // Müşteri yeni bir denemeye geçti; bu taslak onun YERİNE geçildiği için kapanıyor (07.14).
    await cancelDraft(db, order.id, 'superseded');
  }
}

/**
 * Ayrılamayan siparişin taslağı kapatılır: ortada söz verilmemiş yarım bir sipariş kalmaz.
 *
 * **Sebep ZORUNLU parametre** (07.14): `null` "sebep yazılmadı" demektir, "sebep yok" değil — ve
 * onay ekranı iptalin sebebine göre farklı cümle kuruyor. Varsayılan bıraksaydık yeni bir kapatma
 * yolu sessizce sebepsiz yazar, ekran da müşteriye yanlış cümleyi gösterirdi.
 */
async function cancelDraft(db: Db, orderId: string, reason: OrderCancelReason | null): Promise<void> {
  await new OrderService(db).cancel(orderId, 'draft', null, reason);
}

async function releaseOrderStock(db: Db, orderId: string): Promise<void> {
  await new ReservationService(db).releaseByOrder(orderId);
}
