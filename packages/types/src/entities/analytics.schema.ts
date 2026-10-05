import { z } from 'zod';
import { ChannelEnum, CountryEnum, PreferredLanguageEnum } from '../primitives/enums.schema';

/**
 * Analitik olay sözleşmesi; kuralların tamamı `docs/architecture/ANALYTICS.md`'dedir. Atıcının söylediği (`AnalyticsInput`) ile deftere
 * yazılan (`AnalyticsEventInsert`) ayrıdır: bağlamı ve sayılıp sayılmayacağını kapı çözer, kural atıcılara dağılsaydı payda sessizce şişerdi.
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
 * Huninin adım sırası, tek kaynak: etiketler ekranda kalır ama sıra iş kuralıdır (ziyaret → ürün → sepet → checkout → sipariş); iki yerde
 * yazılsaydı iki rapor aynı huninin iki farklı kayıp oranını gösterirdi.
 */
export const ANALYTICS_FUNNEL_STEPS = [
  'page_view',
  'product_view',
  'add_to_cart',
  'checkout_start',
  'order_placed',
] as const satisfies readonly AnalyticsEventType[];

/**
 * Ölçülen nesne; paket ve tarif de katalog yüzeyidir. `path` rota kalıbıdır ve slug maskelidir, "hangi kayıt" sorusunun cevabı
 * `subject_id`dedir.
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
 * Terk sebebi, huninin en değerli kolonu ve tipli olmak zorunda: değerler motorun kararlarının karşılığıdır, serbest metin üç ekranda üç
 * cümleye dağılırdı. Yeni sebep burada bir satır ve migration'da bir enum değeri ister, biri unutulursa olay sessizce düşer.
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
   * Seçilen güne teslimat yok. Bizim arızamız olan hâller (`cart_unreachable`, `warehouse_unresolved`) ve checkout'un normal ilk hâli
   * (`address_missing`) bu listede yoktur, huniye yazılsalardı müşteri vazgeçmiş görünürdü.
   */
  'date_unavailable',
]);
export type AnalyticsBlockedReason = z.infer<typeof AnalyticsBlockedReasonEnum>;

/**
 * UTM künyesi, kapalı sözlük: kapı gelen parametreleri bu beş alana indirger, açık bırakılsaydı tıklama kimlikleri (`gclid`, `fbclid`) anonim
 * deftere sızardı. SQL tarafı bu adları okur (`utm->>'campaign'`), sözlük değişirse iki yer birden değişir.
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
 * Yüzey, olayın hangi uygulamadan geldiği: `AnalyticsDeviceEnum` tarayıcı cihazıdır, native'de hep `mobile` olduğu için yüzeyi ayırt
 * etmez. Ayrı defter değil boyuttur, iki defter aynı huniyi iki kez tanımlardı.
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
 * Atıcının söylediği, olay tipine göre ayrık birlik: her tipin taşıyabileceği alan burada yazılıdır ve `meta` kapalı sözlük kalır. Bağlam
 * alanları (oturum, kanal, yer, cihaz, ülke, dil, yol) burada yoktur, onları kapı çözer.
 */
export const AnalyticsInputSchema = z.discriminatedUnion('type', [
  /**
   * Sayfa açılışı: yol kapıda rota kalıbına çevrilir. UTM burada taşınır ve ayrı kapısı yoktur, çünkü kampanya künyesi yalnız ilk istekte
   * vardır; kapı onu oturumun ilk olayında bir kez kalıcılaştırır.
   */
  z.object({
    type: z.literal('page_view'),
    utm: z.record(z.string()).nullish(),
    /** Yönlendiren ALAN ADI — ham URL değil (sorgu dizesi kişisel veri taşır). */
    source: z.string().nullish(),
    /**
     * Sayfanın öznesi, isteğe bağlı: `path` rota kalıbıdır ve "hangi kayıt" sorusunu cevaplamaz. Öznesi olmayan sayfa (katalog, hesap,
     * sepet) geçmez, zorunlu olsa uydurma kimlik yazılırdı.
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
 * Deftere yazılan satır, kapının ürettiği; `customerId` tipte yoktur, "opsiyonel olarak koyalım" demek derleme hatası olsun diye
 * (`ANALYTICS §2`).
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
 * Günlük özet satırı, ekranların okuduğu şey. `sessionCount` yaklaşıktır, aynı oturum birden çok boyut satırına düşebilir; toplanabilir tek
 * sayı `eventCount`'tur.
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
 * Sinyal özetleri, `analytics_daily`'nin taşıyamadığı üç kırılım: ürünü ya da arama terimini günlük özete boyut yapmak satır sayısını
 * katalog büyüklüğüyle çarpardı. Üç ayrı soru, üç ayrı doğal tavan.
 */

/** Gün × ürün; vitrin seçkisi de bunu okur, ham deftere bağlanmaz. */
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
 * Dönemin ürün sinyali: `cartRate` paydası satılabilir görüntülemedir ve payda 0 ise oran `null`dur, hiç satılabilir görünmemiş ürün "kimse
 * almıyor" diye okunmamalı.
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

/** Dönemin arama sinyali; `zeroResultKind` doluysa sonuç dönmemiş demektir. */
export const AnalyticsSearchSignalSchema = z.object({
  query: z.string(),
  zeroResultKind: AnalyticsZeroResultKindEnum.nullable(),
  searchCount: z.number().int(),
  sessionCount: z.number().int(),
});
export type AnalyticsSearchSignal = z.infer<typeof AnalyticsSearchSignalSchema>;

/**
 * Dönem cirosu gün × kanal: süzgeç sipariş tarihindedir, teslim gününe göre okunan ciro kampanya giderinin dönemiyle hizalanmazdı. Kanal
 * ayrı satırdır, çünkü B2B'nin tek siparişi B2C'nin ortalamasını savurur.
 */
export const OrderRevenueDailySchema = z.object({
  day: z.string(),
  channel: ChannelEnum,
  orderCount: z.number().int(),
  revenueCents: z.coerce.number().int(),
});
export type OrderRevenueDaily = z.infer<typeof OrderRevenueDailySchema>;

/**
 * Kampanya cirosu, ilk temas atfı: satır "o kampanyanın kazandırdığı müşterilerin o dönemdeki siparişleri"dir. `newCustomerCount` bu
 * farkı okutur, yeni kampanyada ciro geç görünür, eskisinde gider bitse de sürer.
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
 * Müşteri segmenti saklanmaz, türetilir: saklanan kolon, tazeleyen iş koşmayınca "uyuyan" listesinde dün sipariş vermiş birini tutardı.
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
 * Haftalık yapay zekâ içgörüsü, üreten iş ile okuyan ekranın ortak sözleşmesi; şema burada durur, çünkü `packages/ai` `types`'a bakar,
 * tersi yasaktır.
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
