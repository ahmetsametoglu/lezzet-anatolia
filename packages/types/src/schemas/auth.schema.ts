import { z } from 'zod';

/**
 * Auth sözleşme şemaları (21.4a) — web giriş yüzeyi ile mobil `/api/v1/auth/*` uçlarının ORTAK dili.
 *
 * Buraya yalnız İKİ yüzeyin birden konuştuğu parçalar girer; akışın kendisi
 * `@lezzet/application/auth`'ta, taşıma sarmalayıcıları uygulamalarda yaşar.
 */

/**
 * 6 haneli tek kullanımlık kod — üretim kuralı `EmailVerificationService`te (kripto-güvenli,
 * sıfır dolgulu), burası tüketici tarafının doğrulama süzgeci: uzunluğu ya da biçimi tutmayan
 * bir giriş RPC'ye (ve deneme sayacına) hiç ulaşmadan çevrilir.
 */
export const OtpCodeSchema = z.string().regex(/^\d{6}$/);
export type OtpCode = z.infer<typeof OtpCodeSchema>;

/**
 * Cihaza dönen oturum — supabase-js `Session`ından ALAN SEÇİMİ, elle uydurulmuş DTO değil:
 * beş alanın kaynağı ve anlamı Supabase sözleşmesidir, adlar yalnız proje camelCase'ine çevrilir.
 * `user` gövdesi BİLEREK taşınmaz — profil `/api/v1/me`'nin işi; iki uç aynı şeyi taşısaydı
 * biri gün gelip ötekinden ayrışırdı.
 *
 * `expiresAt` epoch saniyesidir ve Supabase'te opsiyonel — bilinmiyorsa `null` (CLAUDE §1:
 * ölçülemeyen değer sıfır değildir; uydurulmuş bir damga süresi geçmiş görünmeyen token üretir).
 */
export const AuthSessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  /** Saniye cinsinden ömür (Supabase `expires_in`). */
  expiresIn: z.number().int(),
  /** Epoch saniyesi (Supabase `expires_at`); sağlayıcı vermediyse `null`. */
  expiresAt: z.number().int().nullable(),
  tokenType: z.string().min(1),
});
export type AuthSession = z.infer<typeof AuthSessionSchema>;

/**
 * Auth hata anahtarları — `apps/web/lib/auth/errors.ts` kümesiyle BİREBİR (21.4a keşif kararı).
 * Metin burada YOK ve olmayacak: cümleyi ekran kurar (web sözlüğü webde, RN sözlüğü RN'de);
 * paylaşılan olan yalnız anahtar kümesidir. Web'in kendi `AuthErrorKey` tipi geçiş köprüsüdür,
 * benimsemesi talep dosyasıyla gidecek.
 *
 * Ad `*Enum` — types'ın z.enum geleneği (`MarketingChannelEnum`, `PreferredLanguageEnum`).
 */
export const AuthErrorKeyEnum = z.enum([
  'invalid_email',
  'send_failed',
  'rate_limit',
  'cooldown',
  'invalid_code',
  'code_expired',
  'code_locked',
  'no_active_code',
  'google_unavailable',
  'oauth_failed',
]);
export type AuthErrorKey = z.infer<typeof AuthErrorKeyEnum>;
