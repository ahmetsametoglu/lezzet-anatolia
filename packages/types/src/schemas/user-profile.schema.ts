import { z } from 'zod';
import { dbNumeric } from './db-numeric';
import { CountryEnum, CustomerTypeEnum, PreferredLanguageEnum } from './enums.schema';
import { TranslationBagSchema } from './user-text.schema';

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

export const UserRoleEnum = z.enum(['customer', 'admin', 'warehouse', 'courier', 'accounting']);
export type UserRole = z.infer<typeof UserRoleEnum>;

/** Personel rolleri (guard/operasyon yüzeyi). Müşteri hariç. */
export const STAFF_ROLES = ['admin', 'warehouse', 'courier', 'accounting'] as const;

/**
 * Dev auth bypass'ının kimliği (`apps/web/lib/guard.ts`) — **seed bu id ile gerçek bir admin
 * profili açar.** İkisi aynı olmak ZORUNDA: `order_status_log.actor_id` gibi alanlar
 * `user_profiles`'a FK'lidir; profili olmayan sahte bir kullanıcı ilk geçişte FK ihlali verirdi.
 *
 * Burada durmasının sebebi sınır: `guard.ts` `server-only`dir, seed script'i onu import edemez —
 * sabitin iki yere kopyalanmaması için ortak pakette yaşar.
 */
export const DEV_ADMIN_PROFILE_ID = '00000000-0000-0000-0000-0000000000ad';

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
  codAllowed: z.boolean(),
  marketingConsent: MarketingConsentSchema,
  acquisitionSource: z.record(z.unknown()).nullable(),
  referredBy: z.string().uuid().nullable(),
  /**
   * Müşterinin davet kodu (17.7) — paylaştığı bağlantının ucundaki dize. `null` = henüz istemedi.
   *
   * Kimlik (`id`) KULLANILMAZ: davet bağlantısı WhatsApp'ta ve ekran görüntüsünde dolaşır; orada
   * bir uuid paylaşmak, başka yerlerde anahtar olan bir alanı herkese açık hâle getirirdi.
   */
  referralCode: z.string().nullable(),

  createdAt: z.string(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

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
