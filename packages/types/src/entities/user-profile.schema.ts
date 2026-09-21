import { z } from 'zod';
import { dbNumeric } from '../primitives/db-numeric';
import { CountryEnum, CustomerTypeEnum, PreferredLanguageEnum } from '../primitives/enums.schema';
import { TranslationBagSchema } from '../primitives/user-text.schema';

// Kullanıcı profili: müşteri ve personel tek tabloda, rolle ayrılır. Ticari alanlar aynı satırdadır, çünkü 1:1 uzantı
// tablosu her sepet okumasına join eklerdi; kanal ve açık bakiye saklanmaz, türetilir.

/** Şirket künyesi — doluysa profil B2B'dir. SIRET ile resmî kayıttan dolar (FR). */
export const CompanyInfoSchema = z.object({
  legalName: z.string(),
  siret: z.string().nullish(),
  /** Faaliyet kodu (APE/NAF) — onay kartında "gıda/restoran mı" sinyali. */
  activityCode: z.string().nullish(),
  /** Kuruluş yılı — onay kartı sinyali. */
  foundedYear: z.number().int().nullish(),
  isActive: z.boolean().nullish(),
});
export type CompanyInfo = z.infer<typeof CompanyInfoSchema>;

/** Kanal bazlı pazarlama izni — GDPR kanıtı: ne zaman, nereden verildi. */
export const ConsentSchema = z.object({
  granted: z.boolean(),
  at: z.string().nullish(),
  source: z.string().nullish(),
});
/** Tek kanalın izni. */
export type Consent = z.infer<typeof ConsentSchema>;

export const MarketingConsentSchema = z.object({
  email: ConsentSchema.nullish(),
  whatsapp: ConsentSchema.nullish(),
});
export type MarketingConsent = z.infer<typeof MarketingConsentSchema>;

/**
 * Bildirim türü bazlı ret, `MarketingConsent`ten ayrı: oradaki her ad izin süzgecinde kanal olarak belirirdi. Varsayılanı
 * da ters (opt-out), çünkü değerlendirme daveti rıza değil kolay reddedilebilirlik ister.
 */
export const NotificationConsentSchema = z.object({
  /** Teslim edilmiş siparişin değerlendirme daveti. Yoksa ya da `granted` ise gider. */
  feedbackInvite: ConsentSchema.nullish(),
});
export type NotificationConsent = z.infer<typeof NotificationConsentSchema>;

/** Ret edilebilen bildirim türleri — şemadan TÜRER (`MarketingChannelEnum` ile aynı gerekçe). */
export const NotificationKindEnum = NotificationConsentSchema.keyof();
export type NotificationKind = z.infer<typeof NotificationKindEnum>;

/**
 * İzin kanalları şemanın anahtarlarından türer, yoksa yeni kanal eklenince elle yazılmış liste onu sessizce saymazdı.
 */
export const MarketingChannelEnum = MarketingConsentSchema.keyof();
export type MarketingChannel = z.infer<typeof MarketingChannelEnum>;

/**
 * `system` bir yetki değil, "bu satır bir kişi değil" beyanıdır: hiçbir guard'a uymaz ve müşteri süzgecinden düşer.
 */
export const UserRoleEnum = z.enum(['customer', 'admin', 'warehouse', 'courier', 'accounting', 'system']);

/**
 * Personel rolü: `customer` müşteri eksenidir, `system` kişi bile değildir. Türetilmiştir ki yeni rol tek yerden geçsin.
 */
export const StaffRoleEnum = UserRoleEnum.exclude(['customer', 'system']);
export type StaffRole = z.infer<typeof StaffRoleEnum>;
export type UserRole = z.infer<typeof UserRoleEnum>;

/**
 * Kimlik sorusunun tetiği (DOMAIN §10): `delivery_failed` taşıyıcının beyanıdır ve erken tetikler, `silence` yalnız
 * işarettir. Küme burada, çünkü motor ve DB kısıtı aynı iki değeri ister.
 */
export const ChallengeReasonEnum = z.enum(['silence', 'delivery_failed']);
export type ChallengeReason = z.infer<typeof ChallengeReasonEnum>;

/** Müşterinin genel fiyat kuralının tabanı: `list` liste fiyatından yüzde indirim, `cost` alış fiyatı üzerine yüzde pay. */
export const CustomerPriceBasisEnum = z.enum(['list', 'cost']);
export type CustomerPriceBasis = z.infer<typeof CustomerPriceBasisEnum>;

/** Personel rolleri (guard/operasyon yüzeyi). Müşteri hariç. */
export const STAFF_ROLES = ['admin', 'warehouse', 'courier', 'accounting'] as const;


export const UserProfileSchema = z.object({
  id: z.string().uuid(),
  /**
   * `customer` müşteri eksenidir, diğerleri operasyon rolleri; ikisi bir arada olamaz, personelde çoklu rol olağandır.
   */
  roles: z.array(UserRoleEnum),
  /**
   * Rolün "nerede" ekseni (DOMAIN §17). Boş dizi hiçbir depo demektir, "hepsi" değil; admin ve muhasebe bunu okumaz.
   */
  warehouseIds: z.array(z.string().uuid()),
  type: CustomerTypeEnum,
  name: z.string(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  preferredLanguage: PreferredLanguageEnum,
  country: CountryEnum,
  authUserId: z.string().uuid().nullable(),
  /** B2B self-servis kayıt onayı — onaylanana dek toptan fiyat görünmez. B2C/personelde null. */
  b2bApproved: z.boolean().nullable(),
  /**
   * Başvuru damgası — kuyruğun SIRALAMA ölçütü (`created_at` değil: o profilin doğduğu andır ve
   * B2C açılıp sonra başvuran müşteriyi listenin dibine gönderirdi). DB tetikleyicisi yazar
   * (`stamp_b2b_application`), uygulama elle yazmaz.
   */
  b2bAppliedAt: z.string().datetime({ offset: true }).nullable(),
  /**
   * Ret damgası; `b2bApproved === false` tek başına "bekliyor" demek değildir, hâl `b2bStatusOf`tan okunur.
   * Ret silinmez, yeniden başvuruda eskir.
   */
  b2bRejectedAt: z.string().datetime({ offset: true }).nullable(),
  /** Reddi veren personel — `settings.updatedBy` ile aynı izleme ihtiyacı ("kim karar verdi"). */
  b2bRejectedBy: z.string().uuid().nullable(),
  /** Ret gerekçesi. DB kısıtı damgasız/gerekçesiz reddi yazdırmaz — ikisi birlikte var ya da yok. */
  b2bRejectReason: z.string().nullable(),
  /**
   * Ret gerekçesinin makine çevirileri, çünkü gerekçe müşteriye e-postayla gider; kaynak dil operasyonun tek dilidir.
   */
  b2bRejectReasonTranslations: TranslationBagSchema.nullable(),
  /** Çeviri işi baktı mı — başarısızlıkta da dolar. */
  b2bRejectReasonTranslatedAt: z.string().nullable(),
  /**
   * "Onay kuyruğunda mı"; DB üretir, uygulama yazmaz. Kural veride, çünkü kısmi indeks, kuyruk ve `b2bStatusOf` aynı soruyu sorar.
   */
  b2bPending: z.boolean(),
  /** Taslak (WhatsApp telefonuyla otomatik açılan); doğrulanınca false. Birleştirme adayı işareti. */
  isDraft: z.boolean(),

  // ── Ticari alanlar (0013) — müşteri rolüyle anlamlıdır ─────────────────────
  companyInfo: CompanyInfoSchema.nullable(),
  vatNumber: z.string().nullable(),
  /** VIES doğrulaması; null = hiç sorulmadı. Reverse charge YALNIZ true'da açılır (DOMAIN §5). */
  vatNumberValid: z.boolean().nullable(),
  /**
   * Bayrağın yaşı; bu bayrak %0 KDV açtığı için bayat `true` vergi hatasıdır. Damga yalnız kesin cevapta yazılır.
   */
  vatNumberCheckedAt: z.string().nullable(),
  creditEnabled: z.boolean(),
  /**
   * Vade tavanı, cent; DB kolonu euro `numeric`, dönüşüm `UserProfileService.moneyFields`te.
   */
  creditLimitCents: z.number().int().nullable(),
  paymentTermDays: z.number().int().nullable(),
  /** Yüzde, para değil. */
  discountPercent: dbNumeric.nullable(),
  /**
   * Fiyat grubu üyeliği (B2B alt kademesi); `null` grupsuz, düz liste.
   */
  priceGroupId: z.string().uuid().nullable(),
  codAllowed: z.boolean(),
  marketingConsent: MarketingConsentSchema,
  notificationConsent: NotificationConsentSchema,
  /**
   * Tercih sayfasının oturumsuz anahtarı; `referralCode` ile karışmaz, çünkü o paylaşılır ve bu paylaşılırsa davet
   * bağlantısını gören bildirimleri kapatabilirdi.
   */
  notificationToken: z.string().nullable(),
  acquisitionSource: z.record(z.unknown()).nullable(),
  referredBy: z.string().uuid().nullable(),
  /**
   * Müşterinin davet kodu; `id` kullanılmaz, çünkü davet bağlantısı herkese açık dolaşır.
   */
  referralCode: z.string().nullable(),

  /**
   * WhatsApp bağlama jetonu: kanıtlanan numara "bu hat bu kişide" der, "bu kişi şu hesap" demez. Paylaşılmaz ve
   * dakikalarla ölçülüdür, `referralCode` ile karışırsa herkesin gördüğü dize kimlik yazdırırdı.
   */
  waLinkToken: z.string().nullable(),
  /** Jetonun son geçerlilik anı. Jetonla birlikte var ya da birlikte yok (DB kısıtı). */
  waLinkExpiresAt: z.string().datetime({ offset: true }).nullable(),

  /**
   * E-posta çapası kanıtlandı; `email` dolu olması yerine geçmez, çünkü operatör de yazabilir. Çapa hâli türetilir (`anchorStateOf`).
   */
  emailAnchoredAt: z.string().datetime({ offset: true }).nullable(),
  /** Doğrulanmayı BEKLEYEN adres — `null` = bekleyen bağlama yok. */
  anchorEmail: z.string().nullable(),
  /** Bekleyen adresin istendiği an. Adresle birlikte var ya da birlikte yok (DB kısıtı). */
  anchorEmailAt: z.string().datetime({ offset: true }).nullable(),
  /**
   * 6 haneli güvenlik kodunun SHA-256 özeti, yedek sızarsa (numara, kod) listesi çıkmasın diye; e-posta çapası kurulunca düşer.
   */
  securityCodeHash: z.string().nullable(),
  /** Yanlış deneme sayacı; tavan 5 (DOMAIN §10). Doğru cevapta sıfırlanır. */
  securityCodeAttempts: z.number().int(),

  /**
   * Bekleyen kimlik sorusu; türetilemez, çünkü tetiğin ölçütü soruyu doğuran mesajla tazelenir.
   */
  challengeReason: ChallengeReasonEnum.nullable(),
  /** Sorunun doğduğu an. Sebeple birlikte var ya da birlikte yok (DB kısıtı). */
  challengeRaisedAt: z.string().datetime({ offset: true }).nullable(),

  /**
   * GDPR silme tarihi; satır silinmez, kimliği boşaltılır, çünkü sipariş kaydı yasal olarak durur (`anonymize_customer`).
   * Tarih, çünkü "ne zaman silindi" denetimde sorulur.
   */
  anonymizedAt: z.string().datetime({ offset: true }).nullable(),

  /**
   * Kaydın birleştirildiği müşteri; kayıt silinmez, kapanır. Zincir yasak, yoksa "nereye gitti" tek ad değil bir yol olurdu.
   */
  mergedIntoId: z.string().uuid().nullable(),
  /** Birleştirme anı — bayrak değil TARİH (`anonymizedAt` ile aynı gerekçe). */
  mergedAt: z.string().datetime({ offset: true }).nullable(),
  /** Birleştirmeyi yapan personel; ayrılırsa `null`a döner — iz gider, kayıt kalır. */
  mergedBy: z.string().uuid().nullable(),

  createdAt: z.string(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

/**
 * Birleştirme ön izlemesi, taşımayla aynı sorgudan (`preview_customer_merge`); düşecekler de sayılır ki onay kaybı gizlemesin.
 */
export const CustomerMergePreviewSchema = z.object({
  orders: z.number().int(),
  addresses: z.number().int(),
  tickets: z.number().int(),
  conversations: z.number().int(),
  feedback: z.number().int(),
  /** Hedefte aynı ürün+bağlam zaten değerlendirilmiş → kaynağınki düşer. */
  feedbackDropped: z.number().int(),
  points: z.number().int(),
  /** Bakiyeye eklenecek NET puan — düşecekler hariç. Sayı ile tutar ayrı iki sorudur. */
  pointsDelta: z.number().int(),
  /** Aynı gün ziyaret puanı hedefte zaten var → kaynağınki düşer. */
  pointsDropped: z.number().int(),
  /** İkisinin de sepeti var → kaynağınki silinir (iki sepeti birleştirmek uydurma olurdu). */
  cartDropped: z.boolean(),
  /** Hedef bu birleşmeyle TELEFONU kazanıyor — birleştirmenin asıl sebebi çoğu zaman budur. */
  gainsPhone: z.boolean(),
  gainsEmail: z.boolean(),
  /**
   * Kaynağı hedef davet etmişse götürülecek getiren ödülü; ters satır bakiyeye göre kırpılır, gerçek düşüş bundan az olabilir.
   */
  referralRevoked: z.number().int(),
});
export type CustomerMergePreview = z.infer<typeof CustomerMergePreviewSchema>;

// Insert'te DB üretimli ve varsayılanlı alanlar opsiyonel. `b2bPending` ve iki damga yazılamaz, DB'nin malıdır: şemadan
// çıkarılmaları yanlış yazımı çağrı yerinde hata yapar.
const DB_YAZAR = { b2bPending: true, b2bAppliedAt: true, b2bRejectedAt: true } as const;

export const UserProfileInsertSchema = UserProfileSchema.omit({ createdAt: true, ...DB_YAZAR }).partial();
export type UserProfileInsert = z.infer<typeof UserProfileInsertSchema>;

// Update: id zorunlu, kalanı opsiyonel (yalnız verilen alanlar yazılır).
export const UserProfileUpdateSchema = UserProfileSchema.omit(DB_YAZAR).partial().required({ id: true });
export type UserProfileUpdate = z.infer<typeof UserProfileUpdateSchema>;

// Bul-veya-oluştur girişi (taslak müşteri): en az bir kimlik anahtarı (telefon veya e-posta).
// Normalizasyon (E.164, lowercase) servis içinde helper ile yapılır.
export const FindOrCreateInputSchema = z
  .object({
    phone: z.string().min(1).optional(),
    email: z.string().email().optional(),
    name: z.string().optional(),
    preferredLanguage: PreferredLanguageEnum.optional(),
    country: CountryEnum.optional(),
    type: CustomerTypeEnum.optional(),
  })
  .refine((v) => Boolean(v.phone) || Boolean(v.email), {
    message: 'En az bir kimlik anahtarı gerekir: phone veya email',
  });
export type FindOrCreateInput = z.infer<typeof FindOrCreateInputSchema>;

/**
 * B2B onay kartının AI özeti: tek cümlelik okuma yardımı, karar değil; şema burada ki üreten ile okuyan ayrışmasın.
 */
export const B2bAiSummarySchema = z.object({
  /** Sinyallerden türetilmiş tek cümlelik Türkçe okuma — sinyallerde olmayan hiçbir şeyi söylemez. */
  summary: z.string().min(1),
});
export type B2bAiSummary = z.infer<typeof B2bAiSummarySchema>;
