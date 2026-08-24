import { z } from 'zod';
import { ChannelEnum, CountryEnum, PreferredLanguageEnum } from '../primitives/enums.schema';

/**
 * Analitik olay sözleşmesi (13.1) — kuralların TAMAMI `docs/architecture/ANALYTICS.md`'dedir.
 *
 * **Bu dosyanın taşıdığı ayrım:** atıcının SÖYLEDİĞİ (`AnalyticsInput`) ile deftere YAZILAN
 * (`AnalyticsEventInsert`) ayrı şeylerdir. Atıcı ne olduğunu söyler; bağlamı (oturum, kanal, yer,
 * cihaz, ülke, dil) ve **sayılıp sayılmayacağını** KAPI çözer. Kural atıcılara dağıtılsaydı biri
 * unuturdu ve unutulduğunda hata vermezdi — yalnız payda sessizce şişerdi.
 */

export const AnalyticsEventTypeEnum = z.enum([
  'page_view',
  'product_view',
  'search',
  'place_resolved',
  'add_to_cart',
  'cart_blocked',
  'checkout_start',
  'checkout_blocked',
  'order_placed',
  'share',
]);
export type AnalyticsEventType = z.infer<typeof AnalyticsEventTypeEnum>;

/**
 * **HUNİNİN ADIM SIRASI** — tek kaynak (13.3).
 *
 * Etiketler ekranın dilinde ve ekranda kalır; ama SIRA bir iş kuralıdır: "ziyaret → ürün → sepet →
 * checkout → sipariş". İki yerde ayrı yazılsaydı biri gün gelip bir adım eklerdi ve iki rapor aynı
 * huninin iki farklı kayıp oranını gösterirdi — ikisi de hata vermeden.
 */
export const ANALYTICS_FUNNEL_STEPS = [
  'page_view',
  'product_view',
  'add_to_cart',
  'checkout_start',
  'order_placed',
] as const satisfies readonly AnalyticsEventType[];

/**
 * Ölçülen nesne. Paket de bir katalog yüzeyidir — `product_id` ile ölçülemezdi.
 *
 * **`recipe` 24.08'de katıldı** (08.57, mobil şeridin gözlemi): tarif sayfası ölçülüyordu ama
 * yazılan `path` rota KALIBIDIR ve slug bilerek maskeli (gizlilik kararı, denetim P2). Sonuç:
 * *"kaç tarif sayfası görüntülendi"* cevaplanıyor, *"HANGİ tarif ilgi çekti"* cevaplanmıyordu.
 * Kimliği `path`e yazmak çare değildi — tek alana iki anlam yüklemek olurdu; kimliğin evi zaten
 * `subject_id`.
 */
export const AnalyticsSubjectTypeEnum = z.enum(['product', 'variant', 'bundle', 'category', 'collection', 'recipe']);
export type AnalyticsSubjectType = z.infer<typeof AnalyticsSubjectTypeEnum>;

/**
 * Görüntüleme ANINDAKİ satılabilirlik — anlık görüntü, sonradan kurulamaz (stok hareket eder).
 * Kaydedilmezse "çok bakılıp az alınan" listesinin başına stoksuzlar oturur ve yönetici fiyata
 * bakar; oysa doğru aksiyon tedariktir.
 */
export const AnalyticsAvailabilityEnum = z.enum(['sellable', 'sold_out', 'closed', 'not_here']);
export type AnalyticsAvailability = z.infer<typeof AnalyticsAvailabilityEnum>;

/**
 * **TERK SEBEBİ — huninin en değerli kolonu, ve tipli olmak zorunda.**
 *
 * Değerler motordaki kararların karşılığıdır: `meetsMinBasket` · `splitByRoute` · `diffCartByPlace`
 * · kupon doğrulaması · stok kontrolü · ödeme sonucu. Serbest metin olsaydı üç ekran üç farklı
 * cümle yazardı ve kolon bir ay içinde sorgulanamaz hâle gelirdi.
 *
 * **Yeni bir sebep eklemek buraya bir satır + migration'a bir enum değeri demektir** — ikisi birden;
 * yalnız birini eklemek sessizce düşen bir olay üretir.
 */
export const AnalyticsBlockedReasonEnum = z.enum([
  'min_basket',
  'split',
  'place_change',
  'coupon_invalid',
  'out_of_stock',
  'payment_failed',
  'not_shippable',
  /**
   * Seçilen güne teslimat yok. **Bizim arızamız olan hâller BU LİSTEDE YOK ve bu bir karar**
   * (müşteri şeridinin ayrımı, 04.08): `cart_unreachable` sepet okumasının düşmesidir,
   * `warehouse_unresolved` bölgenin çözülememesidir — huniye yazılsalardı müşteri VAZGEÇMİŞ
   * görünürdü, oysa biz cevap verememişiz; yerleri `error_log`. `address_missing` de yok, çünkü
   * o checkout'un normal ilk hâli: engel sayılsaydı her oturum bir `checkout_blocked` üretir ve
   * olay değerini kaybederdi.
   */
  'date_unavailable',
]);
export type AnalyticsBlockedReason = z.infer<typeof AnalyticsBlockedReasonEnum>;

/**
 * **UTM KÜNYESİ — kapalı sözlük.** Ham sorgu dizesinin anahtarları deftere GİRMEZ; kapı gelen
 * parametreleri bu beş alana indirger (`normalizeUtm`). Açık bırakılsaydı reklam aracının eklediği
 * her parametre — tıklama kimlikleri (`gclid`, `fbclid`) dâhil — anonim deftere sızardı; o kimlikler
 * reklam ağının tarafında tek kullanıcıya çözülür, yani "kimliksiz defter" iddiası düşerdi.
 *
 * SQL tarafı bu adları okuyor (`utm->>'campaign'`, `0036`); sözlük değişirse iki yer birden değişir.
 */
export const UtmTagsSchema = z.object({
  source: z.string().nullish(),
  medium: z.string().nullish(),
  campaign: z.string().nullish(),
  content: z.string().nullish(),
  term: z.string().nullish(),
});
export type UtmTags = z.infer<typeof UtmTagsSchema>;

/** Cihaz — uygulamanın `Device` tipiyle aynı küme. Olayın cihazı İLK BOYAMANIN cihazıdır. */
export const AnalyticsDeviceEnum = z.enum(['mobile', 'desktop']);
export type AnalyticsDevice = z.infer<typeof AnalyticsDeviceEnum>;

/**
 * **YÜZEY** — olayın hangi uygulamadan geldiği (kullanıcı kararı 24.08 · MB-63).
 *
 * `AnalyticsDeviceEnum` ile KARIŞTIRILMAZ: o tarayıcı cihazıdır (`mobile|desktop`), bu ise ürünün
 * hangi yüzeyi. Native uygulamada `device` her zaman `mobile`dır ve o bilgi hiçbir soruyu ayırt
 * etmez — nitekim MB-63'ün arızası tam buydu: `analytics_daily` yalnız web'in sayılarını taşırken
 * ekran "toplam" yazıyordu.
 *
 * **AYRI DEFTER DEĞİL, BOYUT** (kullanıcı kararı): iki defter aynı huniyi iki kez tanımlamak olurdu
 * ve "toplam" sorusu her seferinde elle birleştirme isterdi.
 */
export const AnalyticsSurfaceEnum = z.enum(['web', 'native']);
export type AnalyticsSurface = z.infer<typeof AnalyticsSurfaceEnum>;

/** Nesne referansı — atıcının bildiği kadarı. */
const SubjectSchema = z.object({
  subjectType: AnalyticsSubjectTypeEnum,
  subjectId: z.string().uuid(),
  /** Ürün kırılımı için denormalize anlık görüntü; varyant/paket silinse de ürün okunabilsin. */
  productId: z.string().uuid().nullish(),
});

/**
 * **ATICININ SÖYLEDİĞİ** — olay tipine göre ayrık birlik (discriminated union).
 *
 * Ayrık birlik olması `meta`'nın kapalı sözlük kalmasını SAĞLAYAN şeydir: her tipin taşıyabileceği
 * alan burada yazılı, kapı bunu doğruluyor. Serbest bir `meta` bırakılsaydı altı ay sonra kimsenin
 * şemasını bilmediği bir çöp alan olurdu.
 *
 * Bağlam alanları (oturum · kanal · yer · cihaz · ülke · dil · yol) BURADA YOK ve bilerek: onları
 * kapı çözer. Atıcıya bırakılsalardı her atıcı kendi çözümünü yazardı ve biri gün gelip ötekinden
 * ayrışırdı.
 */
export const AnalyticsInputSchema = z.discriminatedUnion('type', [
  /**
   * Sayfa açılışı — yol KAPIDA rota kalıbına çevrilir, atıcı somut yol göndermez.
   *
   * **UTM burada taşınır ve ayrı bir kapı YOKTUR** (13.2 zemini): kampanya künyesi yalnız ilk
   * istekte vardır ve o istek zaten bir sayfa render'ıdır. Ayrı bir `rememberCampaign` kapısı
   * açılsaydı atıcının iki şeyi birden hatırlaması gerekirdi — biri unutulduğunda kampanya raporu
   * sessizce eksik kalırdı. Kapı bunu oturumun ilk olayında **bir kez** kalıcılaştırır.
   */
  z.object({
    type: z.literal('page_view'),
    utm: z.record(z.string()).nullish(),
    /** Yönlendiren ALAN ADI — ham URL değil (sorgu dizesi kişisel veri taşır). */
    source: z.string().nullish(),
    /**
     * **Sayfanın öznesi — İSTEĞE BAĞLI** (08.57). `path` rota KALIBIDIR (slug maskeli, denetim P2),
     * yani "hangi sayfa türü" cevaplanır ama "hangi kayıt" cevaplanmazdı. Tarif sayfası bunu
     * dolduruyor: kendi `*_view` olayı yok ve olması da gerekmiyor — ölçülen şey aynı, bir içerik
     * sayfasına bakıldı.
     *
     * Öznesi olmayan sayfalar (katalog, hesap, sepet) geçmez ve geçmemeleri doğrudur; zorunlu
     * yapmak her sayfaya uydurma bir kimlik yazdırmak olurdu.
     */
    subjectType: AnalyticsSubjectTypeEnum.optional(),
    subjectId: z.string().uuid().optional(),
  }),

  z.object({
    type: z.literal('product_view'),
    ...SubjectSchema.shape,
    availability: AnalyticsAvailabilityEnum,
  }),

  z.object({
    type: z.literal('search'),
    /**
     * Defterdeki TEK serbest metin. Kapı bunu `scrubMessage`'dan geçirir, normalleştirir ve
     * kısaltır — atıcı ham yazar, temizlik kapının işidir (tek yer).
     */
    query: z.string(),
    resultCount: z.number().int().nonnegative(),
    /**
     * Sıfır sonucun KAYNAĞI. Süzgeç boşluğu SIK bir arayüz sinyali, arama boşluğu SEYREK bir çeşit
     * sinyalidir; aynı listeye konurlarsa sık olan seyreği boğar ve "müşterinin istediği ama bizde
     * olmayan şey" listesi kullanılamaz hâle gelir.
     */
    zeroResultKind: z.enum(['search', 'filter']).nullish(),
  }),

  /**
   * Yer kapısı — huninin İLK adımı. `resolved:false` bir kayıp değil bir HÂLDİR: yer seçmeden
   * gezinen ziyaretçi gerçek ve muhtemelen kalabalık.
   */
  z.object({ type: z.literal('place_resolved'), resolved: z.boolean() }),

  z.object({
    type: z.literal('add_to_cart'),
    ...SubjectSchema.shape,
    qty: z.number().int().positive(),
  }),

  z.object({ type: z.literal('cart_blocked'), reason: AnalyticsBlockedReasonEnum }),
  z.object({ type: z.literal('checkout_start') }),
  z.object({ type: z.literal('checkout_blocked'), reason: AnalyticsBlockedReasonEnum }),

  /** Tutar ve müşteri TAŞIMAZ — yalnız "bu oturum siparişle bitti" der. */
  z.object({ type: z.literal('order_placed') }),

  z.object({
    type: z.literal('share'),
    ...SubjectSchema.shape,
    /** Paylaşım yolu — pano kopyalama ile WhatsApp aynı davranış değil. */
    method: z.enum(['whatsapp', 'copy', 'native']),
  }),
]);
export type AnalyticsInput = z.infer<typeof AnalyticsInputSchema>;

/**
 * **DEFTERE YAZILAN** — kapının ürettiği satır. Atıcı bunu asla kurmaz.
 *
 * `customerId` YOKTUR ve nullable bile değildir (`ANALYTICS §2`): tipte de bulunmaması, bir gün
 * birinin "opsiyonel olarak koyalım" demesini derleme hatasına çevirir.
 */
export const AnalyticsEventInsertSchema = z.object({
  type: AnalyticsEventTypeEnum,
  sessionKey: z.string().min(1),
  /** ROTA KALIBI (`/product/[slug]`), somut değer asla — jeton ve sipariş numarası deftere girmez. */
  path: z.string().nullish(),
  subjectType: AnalyticsSubjectTypeEnum.nullish(),
  subjectId: z.string().uuid().nullish(),
  productId: z.string().uuid().nullish(),
  channel: ChannelEnum.nullish(),
  /** DEPO granülü — posta kodu değil. `null` bir kovadır (yer seçilmemiş), eksik veri değil. */
  warehouseId: z.string().uuid().nullish(),
  availability: AnalyticsAvailabilityEnum.nullish(),
  blockedReason: AnalyticsBlockedReasonEnum.nullish(),
  device: AnalyticsDeviceEnum.nullish(),
  /**
   * Hangi yüzeyden geldi — **ZORUNLU, `nullish` değil.** `default 'web'` ya da opsiyonel bir alan,
   * yüzeyi söylemeyi unutan bir yazımın sessizce web sayılması demekti; yani MB-63'ün arızasının
   * yeniden üretilmesi. Zorunlu alan, unutmayı DERLEME hatasına çevirir.
   */
  surface: AnalyticsSurfaceEnum,
  country: CountryEnum.nullish(),
  language: PreferredLanguageEnum.nullish(),
  meta: z.record(z.unknown()).nullish(),
});
export type AnalyticsEventInsert = z.infer<typeof AnalyticsEventInsertSchema>;

/**
 * Oturumun kampanya künyesi — UTM bir kez düşer, siparişe yazılmaz.
 *
 * `utm` burada KAPALI sözlüktür (`UtmTags`), atıcının verdiği ham kayıt değil: normalleştirme
 * kapıda olur, saklanan hâl budur.
 */
export const AnalyticsSessionSchema = z.object({
  sessionKey: z.string(),
  utm: UtmTagsSchema.nullable(),
  source: z.string().nullable(),
  firstSeenAt: z.string(),
});
export type AnalyticsSession = z.infer<typeof AnalyticsSessionSchema>;

export const AnalyticsSessionInsertSchema = AnalyticsSessionSchema.pick({ sessionKey: true, utm: true, source: true }).partial({
  utm: true,
  source: true,
});
export type AnalyticsSessionInsert = z.infer<typeof AnalyticsSessionInsertSchema>;

/**
 * Günlük özet satırı — **ekranların okuduğu şey.** Ham defter yalnız detay içindir.
 *
 * `sessionCount` YAKLAŞIKTIR: aynı oturum birden çok boyut satırına düşebilir, yani satırların
 * toplamı gerçek oturum sayısından büyüktür. Toplanabilir tek sayı `eventCount`'tur — bunu okuyan
 * ekran bilmezse "toplam ziyaretçi" diye yanlış bir sayı üretir.
 */
export const AnalyticsDailySchema = z.object({
  day: z.string(),
  type: AnalyticsEventTypeEnum,
  path: z.string().nullable(),
  warehouseId: z.string().uuid().nullable(),
  channel: ChannelEnum.nullable(),
  availability: AnalyticsAvailabilityEnum.nullable(),
  /** Yalnız `cart_blocked`/`checkout_blocked` satırlarında dolu — huninin terk kırılımı buradan okunur. */
  blockedReason: AnalyticsBlockedReasonEnum.nullable(),
  eventCount: z.number().int(),
  sessionCount: z.number().int(),
  /** İndis 0 = 00:00 … 23 = 23:00. Isı haritası (haftanın günü × saat) bundan türetilir. */
  hourly: z.array(z.number().int()).length(24),
  updatedAt: z.string(),
});
export type AnalyticsDaily = z.infer<typeof AnalyticsDailySchema>;

/**
 * **SİNYAL ÖZETLERİ (13.2 · 13.4)** — `analytics_daily`'nin taşıyamadığı üç kırılım.
 *
 * Ürünü ya da arama terimini günlük özete BOYUT olarak eklemek satır sayısını katalog büyüklüğüyle
 * çarpardı; huni/ısı/seri okumaları da o şişmiş tabloyu taramak zorunda kalırdı. Üç ayrı soru, üç
 * ayrı doğal tavan.
 */

/** Gün × ürün. Vitrin seçkisi (08.9) de bunu okur — ham deftere bağlanmaz. */
export const AnalyticsProductDailySchema = z.object({
  day: z.string(),
  productId: z.string().uuid(),
  viewCount: z.number().int(),
  cartCount: z.number().int(),
  shareCount: z.number().int(),
  /**
   * "Az alınıyor" yargısının PAYDASI budur, toplam görüntüleme değil: stoksuzken bakılan ürün
   * "ilgi görüp satılmıyor" diye okunursa yönetici fiyata bakar, oysa doğru aksiyon tedariktir.
   */
  sellableViewCount: z.number().int(),
  sessionCount: z.number().int(),
  updatedAt: z.string(),
});
export type AnalyticsProductDaily = z.infer<typeof AnalyticsProductDailySchema>;

/** Sıfır sonucun kovası — `null` "sonuç döndü" demektir (`ANALYTICS §4`). */
export const AnalyticsZeroResultKindEnum = z.enum(['search', 'filter']);
export type AnalyticsZeroResultKind = z.infer<typeof AnalyticsZeroResultKindEnum>;

/** Gün × terim × kova. Sistemdeki tek KALICI serbest metin — ham defterle aynı 25 ayı yaşar. */
export const AnalyticsSearchDailySchema = z.object({
  day: z.string(),
  query: z.string(),
  zeroResultKind: AnalyticsZeroResultKindEnum.nullable(),
  searchCount: z.number().int(),
  sessionCount: z.number().int(),
  updatedAt: z.string(),
});
export type AnalyticsSearchDaily = z.infer<typeof AnalyticsSearchDailySchema>;

/** Gün × kaynak × kampanya. `source: null` DOĞRUDAN trafiktir — eksik veri değil. */
export const AnalyticsSourceDailySchema = z.object({
  day: z.string(),
  source: z.string().nullable(),
  campaign: z.string().nullable(),
  medium: z.string().nullable(),
  sessionCount: z.number().int(),
  eventCount: z.number().int(),
  /** Siparişle biten oturum sayısı — kaynağın kendi dönüşümü (ciroyla karıştırılmamalı). */
  orderSessionCount: z.number().int(),
  updatedAt: z.string(),
});
export type AnalyticsSourceDaily = z.infer<typeof AnalyticsSourceDailySchema>;

/**
 * Dönemin ürün sinyali (13.4 · vitrin 08.9).
 *
 * `cartRate` paydası SATILABİLİR görüntülemedir. Payda 0 ise oran `null` — sıfır değil: hiç
 * satılabilir hâlde görünmemiş ürün "kimse almıyor" diye okunmamalı (`CLAUDE §1`).
 */
export const AnalyticsProductSignalSchema = z.object({
  productId: z.string().uuid(),
  viewCount: z.number().int(),
  cartCount: z.number().int(),
  shareCount: z.number().int(),
  sellableViewCount: z.number().int(),
  sessionCount: z.number().int(),
  cartRate: z.coerce.number().nullable(),
});
export type AnalyticsProductSignal = z.infer<typeof AnalyticsProductSignalSchema>;

/** Dönemin arama sinyali (13.4) — `zeroResultKind` doluysa sonuç dönmemiş demektir. */
export const AnalyticsSearchSignalSchema = z.object({
  query: z.string(),
  zeroResultKind: AnalyticsZeroResultKindEnum.nullable(),
  searchCount: z.number().int(),
  sessionCount: z.number().int(),
});
export type AnalyticsSearchSignal = z.infer<typeof AnalyticsSearchSignalSchema>;

/**
 * **DÖNEM CİROSU — gün × kanal** (13.2).
 *
 * Süzgeç **SİPARİŞ tarihindedir**, teslim gününde değil: bugün verilen sipariş üç gün sonra teslim
 * edilir, yani teslim gününe göre okunan bir dönem cirosu kampanya giderinin dönemiyle hizalanmaz.
 *
 * Kanal ayrı satır çünkü **karışık ölçüm yalan söyler** (`ANALYTICS §3`): B2B'nin tek siparişi
 * B2C'nin ortalamasını savurur. Toplamak okuyanın kararı.
 */
export const OrderRevenueDailySchema = z.object({
  day: z.string(),
  channel: ChannelEnum,
  orderCount: z.number().int(),
  revenueCents: z.coerce.number().int(),
});
export type OrderRevenueDaily = z.infer<typeof OrderRevenueDailySchema>;

/**
 * Kampanya cirosu — **İLK TEMAS atfı** (13.2). Satır "o kampanyanın reklamına tıklayıp sipariş
 * verenler" DEĞİL, "o kampanyanın kazandırdığı müşterilerin o dönemdeki siparişleri"dir.
 *
 * `newCustomerCount` bu farkı okutmak için var: yeni kampanyada ciro geç görünür, eski kampanyada
 * gider bittiği hâlde ciro sürer.
 */
export const AnalyticsCampaignRevenueSchema = z.object({
  campaign: z.string().nullable(),
  source: z.string().nullable(),
  orderCount: z.number().int(),
  /** bigint → JSON: PostgREST büyük sayıyı metin olarak da döndürebilir, o yüzden `coerce`. */
  revenueCents: z.coerce.number().int(),
  customerCount: z.number().int(),
  newCustomerCount: z.number().int(),
});
export type AnalyticsCampaignRevenue = z.infer<typeof AnalyticsCampaignRevenueSchema>;

/**
 * Müşteri segmenti (13.5) — **saklanmaz, TÜRETİLİR.** Saklanan bir segment kolonu, tazeleyen iş bir
 * gün koşmayınca sessizce yanlışa dönerdi ve "uyuyan" listesinde dün sipariş vermiş biri dururdu.
 */
export const CustomerSegmentEnum = z.enum(['champion', 'new', 'active', 'dormant', 'lost']);
export type CustomerSegment = z.infer<typeof CustomerSegmentEnum>;

export const CustomerSegmentCountSchema = z.object({
  segment: CustomerSegmentEnum,
  customerCount: z.number().int(),
  orderCount: z.number().int(),
  /** bigint → JSON: PostgREST büyük sayıyı metin olarak da döndürebilir, o yüzden `coerce`. */
  revenueCents: z.coerce.number().int(),
});
export type CustomerSegmentCount = z.infer<typeof CustomerSegmentCountSchema>;

/**
 * **HAFTALIK AI İÇGÖRÜ** (13.7) — üreten iş ile okuyan ekranın ortak sözleşmesi.
 *
 * Şema `packages/ai`'da değil BURADA çünkü iki tarafı var: AI görevi çıktı sözleşmesi olarak
 * kullanır, ekran saklanmış hâlini okur. `packages/ai` zaten `types`'a bakıyor, tersi yasak
 * (`STACK §4`) — emsal `SuggestLocalizedOutputSchema`.
 */
export const AnalyticsInsightSchema = z.object({
  headline: z.string(),
  findings: z
    .array(
      z.object({
        title: z.string(),
        detail: z.string(),
        tone: z.enum(['good', 'watch', 'bad']),
      }),
    )
    .max(5),
  /**
   * Önerilen tek adım — ya da `null`. **Boş bırakabilmesi şart:** her hafta bir öneri üretmeye
   * zorlanan model, veri yokken de bir şey uydurur ve o uydurma bir aksiyona dönüşür.
   */
  nextStep: z.string().nullable(),
});
export type AnalyticsInsight = z.infer<typeof AnalyticsInsightSchema>;

/**
 * Saklanan hâli — anlatı + HANGİ DÖNEM + ne zaman üretildiği.
 *
 * Zaman damgası olmadan saklansaydı iş bir hafta koşmadığında ekran eski anlatıyı BU haftanınmış
 * gibi gösterirdi ve kimse fark etmezdi.
 */
export const StoredAnalyticsInsightSchema = AnalyticsInsightSchema.extend({
  generatedAt: z.string(),
  period: z.object({ from: z.string(), to: z.string(), days: z.number().int() }),
});
export type StoredAnalyticsInsight = z.infer<typeof StoredAnalyticsInsightSchema>;

/** `settings` anahtarı — iş yazar, ekran okur; metin tek yerde durur. */
export const ANALYTICS_INSIGHT_SETTING = 'analytics_weekly_insight';

export const CustomerSegmentMemberSchema = z.object({
  customerId: z.string().uuid(),
  orderCount: z.number().int(),
  lastOrderAt: z.string(),
  /** bigint → JSON: PostgREST büyük sayıyı metin olarak da döndürebilir, o yüzden `coerce`. */
  revenueCents: z.coerce.number().int(),
});
export type CustomerSegmentMember = z.infer<typeof CustomerSegmentMemberSchema>;
