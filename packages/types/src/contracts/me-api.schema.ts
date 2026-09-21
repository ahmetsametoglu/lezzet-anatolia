import { z } from 'zod';
import { MarketingChannelEnum, UserProfileSchema } from '../entities/user-profile.schema';
import { PreferredLanguageEnum } from '../primitives/enums.schema';

/**
 * `/api/v1/me` sözleşmesi, mobil uç ile uygulama kabuğunun ortak dili. Varlık şemasından ayrı dosyada, çünkü
 * `/me`nin küçülmesi şemanın küçülmesi değildir.
 */

/**
 * `PATCH /api/v1/me` gövdesi: yalnız ad ve telefon. E-posta kimliğin kendisidir, dil ve izinler tercih uçlarındadır;
 * gönderilmeyen alana dokunulmaz, `phone: null` numarayı siler.
 */
export const MeUpdateSchema = z
  .object({
    name: z.string(),
    phone: z.string().nullable(),
  })
  .partial();

/**
 * Güncellemenin adlı retleri; cümleyi ekran kurar.
 */
export const MeUpdateErrorEnum = z.enum(['name_required', 'phone_invalid']);
export type MeUpdateError = z.infer<typeof MeUpdateErrorEnum>;

/**
 * `PATCH /api/v1/me/preferences` gövdesi: dil ve kampanya izinleri, ayrı kapı. İzin bayrak taşır, kayıt değil: damgayı
 * sunucu vurur; `z.record` bilinmeyen kanalı adıyla reddeder, nesne şeması sessizce düşürürdü.
 */
export const MePreferencesSchema = z
  .object({
    preferredLanguage: PreferredLanguageEnum,
    marketingConsent: z.record(MarketingChannelEnum, z.boolean()),
  })
  .partial();

/**
 * Tercih güncellemesinin durum retleri; `no_changes` alan taşımayan gövdeyi görünür kılar, aynı değer ret değildir.
 */
export const MePreferencesErrorEnum = z.enum(['no_changes', 'profile_not_found']);
export type MePreferencesError = z.infer<typeof MePreferencesErrorEnum>;

/**
 * Müşteriye bakan alanlar; personel kapsamı, ticari koşullar ve iç yaşam döngüsü bilerek dışarıda. `roles` içeride,
 * çünkü uygulama kökü hangi kabuğu açacağına onunla karar verir; `pick` dışındaki alan zarfa sızamaz.
 */
export const MeSchema = UserProfileSchema.pick({
  id: true,
  type: true,
  name: true,
  email: true,
  phone: true,
  preferredLanguage: true,
  country: true,
  roles: true,
  b2bApproved: true,
  b2bPending: true,
  marketingConsent: true,
  referralCode: true,
  createdAt: true,
});
