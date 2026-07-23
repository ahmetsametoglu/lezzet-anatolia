import { z } from 'zod';

// Customer (kimlik altkümesi) — 0001 migration ile birebir; alanlar modüller ilerledikçe büyür.
// Konvansiyon (referans): app modeli camelCase; Schema / InsertSchema / UpdateSchema türetilir.

export const CustomerTypeEnum = z.enum(['individual', 'company']);
export type CustomerType = z.infer<typeof CustomerTypeEnum>;

export const PreferredLanguageEnum = z.enum(['tr', 'fr', 'de']);
export type PreferredLanguage = z.infer<typeof PreferredLanguageEnum>;

export const CountryEnum = z.enum(['FR', 'DE']);
export type Country = z.infer<typeof CountryEnum>;

export const CustomerSchema = z.object({
  id: z.string().uuid(),
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
export type Customer = z.infer<typeof CustomerSchema>;

// id DB-üretimli (gen_random_uuid) → insert'te opsiyonel; createdAt'i DB koyar.
export const CustomerInsertSchema = CustomerSchema.omit({ createdAt: true }).partial();
export type CustomerInsert = z.infer<typeof CustomerInsertSchema>;

// Update: id zorunlu, kalanı opsiyonel (yalnız verilen alanlar yazılır).
export const CustomerUpdateSchema = CustomerSchema.partial().required({ id: true });
export type CustomerUpdate = z.infer<typeof CustomerUpdateSchema>;

// Bul-veya-oluştur girişi: en az bir kimlik anahtarı (telefon veya e-posta).
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
