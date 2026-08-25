import { z } from 'zod';
import { dbNumeric } from '../primitives/db-numeric';
import { CountryEnum, CustomerTypeEnum, PreferredLanguageEnum } from '../primitives/enums.schema';
import { TranslationBagSchema } from '../primitives/user-text.schema';

// Kullanıcı profili (kimlik) — 0001 + 0013 migration ile birebir. TEK tablo: müşteri + personel;
// ROL ayırır. "customer" bir ROLDÜR, ayrı tablo değil.
//
// Ticari alanlar (vade, indirim, kapıda ödeme, şirket künyesi, pazarlama izni) aynı satırdadır:
// müşteri rolüyle davranan profilin alanlarıdır, personel satırında boş dururlar. 1:1 uzantı tablosu
// açılmadı — her sepet/checkout okumasına join ekler, kimlik kurulumuna ikinci satır yazımı getirir.
//
// Kanal (b2b/b2c) SAKLANMAZ: `companyInfo` varlığından türetilir. Açık bakiye de saklanmaz
// (ödenmemiş vadeli siparişlerden türetilir).

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
/** Tek kanalın izni — operasyon ekranı bunu ALAN ALAN yeniden yazıyordu (denetim O9). */
export type Consent = z.infer<typeof ConsentSchema>;

export const MarketingConsentSchema = z.object({
  email: ConsentSchema.nullish(),
  whatsapp: ConsentSchema.nullish(),
});
export type MarketingConsent = z.infer<typeof MarketingConsentSchema>;

/**
 * Bildirim TÜRÜ bazlı ret (22.08) — `MarketingConsent`ten AYRI ve bu ayrım kasıtlı.
 *
 * Orası KANAL sözlüğü ve `MarketingChannelEnum` onun anahtarlarından türüyor; buraya konan her ad
 * operasyonun "izinli müşteriler" süzgecinde bir kanal olarak belirirdi.
 *
 * **Varsayılan da ters:** pazarlama izni opt-in (anahtar yoksa izin yok), bu opt-out (anahtar yoksa
 * gönderilir). Hukuki ayrım: kampanya açık rıza ister; teslim edilmiş bir siparişin değerlendirme
 * daveti mevcut müşteri ilişkisine dayanır ve gereken şey rıza değil, kolay reddedilebilirliktir.
 * Kolon künyesi (`0011`) aynı gerekçeyi taşıyor.
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
 * İzin KANALLARI — şemanın kendi anahtarlarından TÜRER (`.keyof()`), elle ikinci bir liste yazılmaz.
 *
 * Gerekçe pratikte yaşandı: kanal listesi ayrı yazılsaydı üçüncü kanal (SMS) eklendiğinde şema
 * büyür, liste unutulur ve "izinli müşteriler" süzgeci yeni kanalı sessizce saymazdı. Türetilmiş
 * hâlde derleme durur.
 */
export const MarketingChannelEnum = MarketingConsentSchema.keyof();
export type MarketingChannel = z.infer<typeof MarketingChannelEnum>;

export const UserRoleEnum = z.enum(['customer', 'admin', 'warehouse', 'courier', 'accounting']);
export type UserRole = z.infer<typeof UserRoleEnum>;

/** Personel rolleri (guard/operasyon yüzeyi). Müşteri hariç. */
export const STAFF_ROLES = ['admin', 'warehouse', 'courier', 'accounting'] as const;

/*
  ── `DEV_ADMIN_PROFILE_ID` ve `DEV_BYPASS_AUTH_ID` KALDIRILDI (19.08) ────────────────────────────
  İkisi de `apps/web/lib/guard.ts`in dev auth bypass'ının kimlikleriydi: biri bypass'ın sahte
  kullanıcısına, öteki seed'in onun için açtığı gerçek profile aitti. Bypass söküldü (gerekçe
  guard'ın künyesinde: ölçüldü, oturumsuz `/operations` yerelde 200 dönüyordu), dolayısıyla iki
  kimlik de sahipsiz kaldı. Yerelde artık gerçek oturum var — aktör kimliği de gerçek personelin.

  04.11'in dersi kaybolmadı, taşındı: auth kimliği ≠ profil kimliği ayrımı `guard.ts`teki
  `StaffUser` künyesinde yaşıyor ve nöbeti bugün sabit değil, gerçek girişin kendisi tutuyor.
*/

export const UserProfileSchema = z.object({
  id: z.string().uuid(),
  /**
   * İki eksen, tek alan (DOMAIN §2): `customer` müşteri eksenidir, diğerleri operasyon rolleri.
   * Müşteri ↔ personel keskin ayrım (bir arada olamaz); personel içinde çoklu rol olağandır.
   * Kural DB'de check kısıtıyla zorlanır, saf hâli `domain-core/identity/roles`'ta.
   */
  roles: z.array(UserRoleEnum),
  /**
   * Rolün İKİNCİ EKSENİ: ne yapar (`roles`) × NEREDE yapar (DOMAIN §17). `roles` ile aynı karar,
   * aynı gerekçe — kapsam okuması guard'ın sıcak yolunda, bağ tablosu her istekte join demekti.
   *
   * **Boş dizi = HİÇBİR depo**, "hepsi" değil (fail-closed): depocu/kurye kapsamsız kalırsa kapı
   * kapanır. Admin/muhasebe depo-ÜSTÜdür; onlarda boş kapsam normaldir ve hiç okunmaz.
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
   * Ret damgası. **`b2bApproved === false` tek başına "bekliyor" DEMEK DEĞİLDİR** — reddedilen
   * kayıt da o değeri taşır (09.11: ret silmez). Hâl ayrımı için `b2bStatusOf` kullanılır; alanı
   * doğrudan okuyup çip çizen ekran reddedilene "inceleniyor" der.
   *
   * Ret silinmez, ESKİR: aday künyesini düzeltip yeniden başvurursa kuyruğa geri gelir ve ret
   * kaydı geçmiş olarak durur. Bu alan artık "ne zaman reddedildi"yi göstermek içindir.
   */
  b2bRejectedAt: z.string().datetime({ offset: true }).nullable(),
  /** Reddi veren personel — `settings.updatedBy` ile aynı izleme ihtiyacı ("kim karar verdi"). */
  b2bRejectedBy: z.string().uuid().nullable(),
  /** Ret gerekçesi. DB kısıtı damgasız/gerekçesiz reddi yazdırmaz — ikisi birlikte var ya da yok. */
  b2bRejectReason: z.string().nullable(),
  /**
   * Ret gerekçesinin makine çevirileri (20.2) — gerekçe müşteriye E-POSTAYLA gidiyor, yani
   * personelin Türkçe cümlesi Fransızca/Almanca konuşan birine ulaşıyor.
   *
   * Ayrı bir kaynak-dil kolonu yok: operasyon yüzeyi tek dilli (CLAUDE §2) ve torbada olmayan dil
   * zaten "orijinal o dilde" demeye yeter — `resolveUserText` bu hâlde orijinale düşer.
   */
  b2bRejectReasonTranslations: TranslationBagSchema.nullable(),
  /** Çeviri işi baktı mı — başarısızlıkta da dolar. */
  b2bRejectReasonTranslatedAt: z.string().nullable(),
  /**
   * "Onay kuyruğunda mı" — **DB üretiyor** (`generated always as … stored`), uygulama YAZMAZ.
   * Künyesi var + onaylanmamış + (hiç reddedilmemiş veya reddi eskimiş).
   *
   * Kural veride duruyor çünkü üç yer birden soruyor: kısmi indeks, kuyruk süzgeci ve
   * `b2bStatusOf`. Üçüne ayrı yazılsaydı biri gün gelip ayrışırdı ve ayrıştığında hata vermezdi —
   * yalnız yanlış bir liste üretirdi.
   */
  b2bPending: z.boolean(),
  /** Taslak (WhatsApp telefonuyla otomatik açılan); doğrulanınca false. Birleştirme adayı işareti. */
  isDraft: z.boolean(),

  // ── Ticari alanlar (0013) — müşteri rolüyle anlamlıdır ─────────────────────
  companyInfo: CompanyInfoSchema.nullable(),
  vatNumber: z.string().nullable(),
  /** VIES doğrulaması; null = hiç sorulmadı. Reverse charge YALNIZ true'da açılır (DOMAIN §5). */
  vatNumberValid: z.boolean().nullable(),
  creditEnabled: z.boolean(),
  /**
   * Vade tavanı — **cent** (02.9 dilim: profil ailesi). DB kolonu `credit_limit` euro `numeric`
   * kalır; dönüşüm sınırda, `UserProfileService.moneyFields` ile (`STACK §8`).
   *
   * Adının birimi söylemesi şart: bu alan üç ayrı yerde elle çevriliyordu ve biri
   * `creditLimit * 100` yazıyordu — 74,17 € → 0,74 € hatasının doğduğu desenin ta kendisi.
   */
  creditLimitCents: z.number().int().nullable(),
  paymentTermDays: z.number().int().nullable(),
  /** YÜZDE, para değil — 02.9'un kapsamı dışında (`dbNumeric` burada oran taşır). */
  discountPercent: dbNumeric.nullable(),
  /**
   * Fiyat grubu üyeliği (`price_group`, 20.08) — B2B alt kademesi (market · restoran/pastane…).
   * `discountPercent`ten AYRI eksen: o kampanya havuzunda yarışan bir indirimdir, bu fiyatın
   * kendisidir (çözüm sırası: müşteriye özel → grup → liste). `null` = grupsuz, düz liste.
   */
  priceGroupId: z.string().uuid().nullable(),
  codAllowed: z.boolean(),
  marketingConsent: MarketingConsentSchema,
  notificationConsent: NotificationConsentSchema,
  /**
   * Tercih sayfasının oturumsuz anahtarı (22.08) — her mailin altbilgisindeki bağ bunu taşır.
   * `null` = bu profile henüz mail gitmedi; jeton istek üzerine doğar (`referralCode` deseni).
   *
   * `referralCode` ile KARIŞTIRILMAZ: o paylaşılmak için var, bu paylaşılmamak için. Aynı dize
   * ikisini birden yapsaydı, davet bağlantısını gören herkes davet edenin bildirimlerini
   * kapatabilirdi.
   */
  notificationToken: z.string().nullable(),
  acquisitionSource: z.record(z.unknown()).nullable(),
  referredBy: z.string().uuid().nullable(),
  /**
   * Müşterinin davet kodu (17.7) — paylaştığı bağlantının ucundaki dize. `null` = henüz istemedi.
   *
   * Kimlik (`id`) KULLANILMAZ: davet bağlantısı WhatsApp'ta ve ekran görüntüsünde dolaşır; orada
   * bir uuid paylaşmak, başka yerlerde anahtar olan bir alanı herkese açık hâle getirirdi.
   */
  referralCode: z.string().nullable(),

  /**
   * **WhatsApp bağlama jetonu** (04.10) — "WhatsApp'ımı bağla" düğmesinin ürettiği, önceden yazılı
   * mesajın içindeki dize. `null` = bekleyen bağlama yok.
   *
   * Numaranın kanıtlanması *"bu hat bu kişide"* der, *"bu kişi ŞU HESAP"* demez. Müşteri
   * kendiliğinden yazdığında elimizde hesabı gösteren hiçbir şey olmadığı için yeni bir taslak
   * doğar; jeton o boşluğu kapatır.
   *
   * **`referralCode` ile aynı şey DEĞİL:** o paylaşılmak için var ve ömürsüz; bu paylaşılmamak
   * için var ve dakikalarla ölçülü. Karışırsa ortaya, herkesin gördüğü bir dizeyle kimlik anahtarı
   * yazdıran bir kapı çıkar.
   */
  waLinkToken: z.string().nullable(),
  /** Jetonun son geçerlilik anı. Jetonla birlikte var ya da birlikte yok (DB kısıtı). */
  waLinkExpiresAt: z.string().datetime({ offset: true }).nullable(),

  /**
   * **E-posta çapası kanıtlandı** (04.10) — kod e-postaya gitti, müşteri WhatsApp'tan geri yazdı.
   *
   * `email is not null` bunun YERİNE geçmez: o kolon elle işlenen DM'de operatörün klavyesinden de
   * dolabiliyor. "Adresi var" ile "adresi kanıtlandı" iki ayrı gerçek — telefonda yaptığımız
   * ayrımın aynısı. Üçüncü kanıt yolu (`authUserId`) damga istemez: o kutuya gelen kodla giriş
   * yapılmıştır. Çapa hâli üçünden TÜRETİLİR (`anchorStateOf`), saklanmaz.
   */
  emailAnchoredAt: z.string().datetime({ offset: true }).nullable(),
  /** Doğrulanmayı BEKLEYEN adres — `null` = bekleyen bağlama yok. */
  anchorEmail: z.string().nullable(),
  /** Bekleyen adresin istendiği an. Adresle birlikte var ya da birlikte yok (DB kısıtı). */
  anchorEmailAt: z.string().datetime({ offset: true }).nullable(),
  /**
   * **6 haneli güvenlik kodunun SHA-256 özeti** (04.10) — e-posta bağlamak istemeyene verilen çapa.
   *
   * Özet, canlı DB'ye yazma yetkisi olana karşı değil (o zaten cevabı değiştirebilir): **yedek
   * sızarsa** ortaya (numara, kod) listesi çıkmasın diye. `email_verifications` ile aynı disiplin.
   *
   * E-posta çapası kurulunca DÜŞER — iki çapa aynı müşteride bulunmaz (DB kısıtı zorluyor).
   */
  securityCodeHash: z.string().nullable(),
  /** Yanlış deneme sayacı; tavan 5 (DOMAIN §10). Doğru cevapta sıfırlanır. */
  securityCodeAttempts: z.number().int(),

  /**
   * GDPR silme damgası (05.08) — `null` = hiç silinmedi.
   *
   * Satır SİLİNMEZ, kimliği boşaltılır: `order` bu profile `restrict` ile bağlı ve sipariş/fatura
   * kaydı yasal olarak duruyor. Kararın tamamı `anonymize_customer` (0037) içinde, tek yerde.
   *
   * **Bayrak değil TARİH:** "ne zaman silindi" denetimde sorulan bir sorudur ve boolean'a
   * düşürülmüş bir kayıt onu bir daha cevaplayamaz. Ekran bunu okuyup anonim kaydı normal bir
   * müşteriden ayırabilmeli — adı boş bir satır, silinmiş bir hesap ile yarım kalmış bir taslak
   * arasında ayrım yapamayan gözde aynı görünür.
   */
  anonymizedAt: z.string().datetime({ offset: true }).nullable(),

  /**
   * **Bu kayıt hangi müşteriye birleştirildi** (09.10); `null` = birleştirilmedi.
   *
   * Kayıt SİLİNMEZ, kapanır: `order.customer_id` `restrict` olduğu için silme zaten reddedilirdi.
   * Ekran bu bağı okuyup *"Bu kayıt X ile birleştirildi"* diyebilir ve operatör eski bağlantıyı
   * takip edebilir — `anonymizedAt` deseninin ikizi, orada da satır duruyor kimliği boşalıyor.
   *
   * **Zincir YASAK** (A→B→C): kapanmış bir kayıt ne hedef ne kaynak olabilir (RPC reddeder).
   * Zincire izin verseydik "bu kayıt nereye gitti" sorusunun cevabı tek bir ada değil bir yola
   * dönerdi ve ekran onu gösteremezdi.
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
 * Birleştirme ÖN İZLEMESİ (09.10) — onay diyaloğunun okuduğu döküm.
 *
 * Taşımanın kendisiyle **aynı sorgudan** türüyor (`preview_customer_merge`): iki ayrı liste bir gün
 * ayrışırsa operatör onayladığından farklı bir şey taşınmış olurdu.
 *
 * **Düşecekler de sayılıyor** ve bu bir dürüstlük kararı: yalnız kazanımı gösteren bir onay ekranı
 * kaybı gizler. Operatör *"3 değerlendirme taşınacak, 1'i düşecek"* cümlesini görmeli.
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
});
export type CustomerMergePreview = z.infer<typeof CustomerMergePreviewSchema>;

// id/role/createdAt DB-üretimli/varsayılanlı → insert'te opsiyonel. Ticari alanların hepsi de
// varsayılanlı ya da nullable: personel profili hiçbirini vermeden açılır.
//
// Üç alan YAZILAMAZ, hepsi DB'nin malı: `b2bPending` üretilmiş kolon (Postgres yazmayı reddeder),
// iki damgayı ise tetikleyici atar. Damgaların DB'de kalması bir tercih değil şart: ikisi
// birbiriyle karşılaştırılıyor ve ayrı saatlerden gelirlerse aradaki kayma başvurunun hâlini ters
// çevirebilir. Şemadan çıkarmak bunu ÇAĞRI YERİNDE hata hâline getirir — yoksa yanlış yazan kod
// ancak veritabanına vardığında öğrenir.
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
 * B2B onay kartının AI özeti (09.11c · sınıf 3, 16.08) — TEK cümle, okuma yardımı; karar değil.
 * Şema burada, `packages/ai`'da değil: üreten görev ile okuyan ekran ayrışmasın (emsal:
 * `AnalyticsInsightSchema`).
 */
export const B2bAiSummarySchema = z.object({
  /** Sinyallerden türetilmiş tek cümlelik Türkçe okuma — sinyallerde olmayan hiçbir şeyi söylemez. */
  summary: z.string().min(1),
});
export type B2bAiSummary = z.infer<typeof B2bAiSummarySchema>;
