import { z } from 'zod';

// Kullanıcı profili (kimlik) — 0001 migration ile birebir. TEK tablo: müşteri + personel; ROL ayırır.
// Çok-rol yok (kullanıcı tek rol). "customer" bir roldür, ayrı tablo değil (referans: user_profiles).

export const UserRoleEnum = z.enum(['customer', 'admin', 'warehouse', 'courier']);
export type UserRole = z.infer<typeof UserRoleEnum>;

/** Personel rolleri (guard/operasyon yüzeyi). Müşteri hariç. */
export const STAFF_ROLES = ['admin', 'warehouse', 'courier'] as const;

export const CustomerTypeEnum = z.enum(['individual', 'company']);
export type CustomerType = z.infer<typeof CustomerTypeEnum>;

export const PreferredLanguageEnum = z.enum(['tr', 'fr', 'de']);
export type PreferredLanguage = z.infer<typeof PreferredLanguageEnum>;

export const CountryEnum = z.enum(['FR', 'DE']);
export type Country = z.infer<typeof CountryEnum>;

export const UserProfileSchema = z.object({
  id: z.string().uuid(),
  role: UserRoleEnum,
  type: CustomerTypeEnum,
  name: z.string(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  preferredLanguage: PreferredLanguageEnum,
  country: CountryEnum,
  authUserId: z.string().uuid().nullable(),
  b2bApproved: z.boolean().nullable(),
  isDraft: z.boolean(),
  createdAt: z.string(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

// id/role/createdAt DB-üretimli/varsayılanlı → insert'te opsiyonel.
export const UserProfileInsertSchema = UserProfileSchema.omit({ createdAt: true }).partial();
export type UserProfileInsert = z.infer<typeof UserProfileInsertSchema>;

// Update: id zorunlu, kalanı opsiyonel (yalnız verilen alanlar yazılır).
export const UserProfileUpdateSchema = UserProfileSchema.partial().required({ id: true });
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
