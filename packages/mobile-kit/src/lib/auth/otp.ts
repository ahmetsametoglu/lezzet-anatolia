import {
  AuthErrorKeyEnum,
  AuthSessionSchema,
  OtpCodeSchema,
  type AuthErrorKey,
  type AuthSession,
  type PreferredLanguage,
} from '@lezzet/types';
import { z } from 'zod';
import { apiFetch, failureCauseOf, type ApiFail } from '../api/client';
import { runSignInEffects } from './sign-in-effects';
import { getSupabase } from './supabase';

/*
  OTP akışının cihaz ucu — uçlar apps/mobile-api `/api/v1/auth/otp/*`, şemalar @lezzet/types
  (sözleşme tek kaynak; cevap AYNI Zod şemasıyla parse edilir, 02-mimari §3.2).
  UI YOK: bu katman veri döner, cümleyi ekran kurar (anahtar → metin eşlemesi ekran sözlüğünde).
*/

/**
 * Auth sonucu — hata anahtarı `AuthErrorKeyEnum`'dan TİPLİDİR; 429'da bekleme süresi taşınır.
 * `offline`: istek ağa HİÇ çıkamadı (`failureCauseOf` → `connection`). Anahtar yine `send_failed` — müşteri
 * hâlleri kümesine istemci ayrıntısı sızmaz (`toAuthErrorKey`); bayrak operasyon girişinin "Bağlantı yok"
 * bandını besler (21.312).
 * Bilerek İHRAÇ EDİLMİYOR: bugün tüketeni yok (knip ölü ihracı yakalar — mobile-api `Me` emsali);
 * ekranlar gelince ihraç açılır ya da tüketen `ReturnType` ile türetir.
 */
type OtpFailure<E extends string> = { data: null; error: E; retryAfterSec: number | null; offline: boolean };
type OtpResult<T, E extends string = AuthErrorKey> = { data: T; error: null; retryAfterSec: null } | OtpFailure<E>;

/**
 * **Yalnız kayıtlı hesap** (21.312) — operasyon girişinin kuralı: sistemde hesabı olmayan e-postaya kod
 * GİTMEZ, doğrulama hesap AÇMAZ (kullanıcı kararı 14.09: *"kullanıcı sistemde kayıtlı değilse giriş
 * yapamayacak"*). Sunucunun reddi `not_registered`tir.
 *
 * Anahtar ortak `AuthErrorKeyEnum`e GİRMEDİ: web sözlüğü `Record<AuthErrorKey, …>` ve webde bu anahtarı
 * üreten yol yok (`login-notice.ts`teki `session_ended` emsali). Cümleyi operasyon ekranı kurar.
 *
 * Tip BAYRAĞA bağlı (aşırı yükleme): bayraksız çağrının hata kümesi değişmez — müşteri girişi bu anahtarı hiç
 * görmez ve ekranına ölü bir dal yazılmaz.
 */
export const NOT_REGISTERED = 'not_registered';

/** Operasyon girişinin bayrağı — yalnız sistemde hesabı olan e-posta. Müşteri akışı hiç vermez. */
interface RegisteredOnly {
  registeredOnly: true;
}

/** Operasyon girişinin hata kümesi: müşteri anahtarları + `not_registered`. */
type RegisteredOnlyError = AuthErrorKey | typeof NOT_REGISTERED;

/** Bayrak YALNIZ verildiğinde gövdeye girer — müşteri girişinin gövdesi değişmez. */
const registeredOnlyOf = (options?: RegisteredOnly): { registeredOnly?: true } =>
  options?.registeredOnly === true ? { registeredOnly: true } : {};

/**
 * Telin/istemcinin serbest hata dizgesini tipli anahtara indirger. Enum dışı her şey (ağ yok,
 * bozuk gövde, beklenmedik anahtar) müşteri dilinde `send_failed`tir — sunucunun "kod doğruydu
 * ama oturum kurulamadı" hâline seçtiği anahtarla aynı (auth-otp.ts 502 kararı): müşteri hâlleri
 * kümesine istemci-içi ayrıntı sızdırılmaz, ayrıntıyla ne yapılacağı log altyapısının işi olacak.
 */
function toAuthErrorKey(error: string): AuthErrorKey | typeof NOT_REGISTERED {
  // Tek istisna operasyon girişinin reddi — müşteri hâli değil, ekranın ayrı bir cümlesi var (21.312).
  if (error === NOT_REGISTERED) return NOT_REGISTERED;
  const parsed = AuthErrorKeyEnum.safeParse(error);
  return parsed.success ? parsed.data : 'send_failed';
}

/** Düşen çağrının sonucu — iki uç aynı biçimi döndürür; `offline` sebep sınıfından okunur, tahmin edilmez. */
function toOtpFailure(result: ApiFail): OtpFailure<RegisteredOnlyError> {
  return {
    data: null,
    error: toAuthErrorKey(result.error),
    retryAfterSec: result.retryAfterSec,
    offline: failureCauseOf(result) === 'connection',
  };
}

const VerifyResponseSchema = z.object({ session: AuthSessionSchema });

/** Kod isteği. 429'da (`rate_limit`/`cooldown`) `retryAfterSec` doludur — geri sayımı ekran kurar. */
export async function requestOtp(email: string, locale: PreferredLanguage): Promise<OtpResult<true>>;
export async function requestOtp(
  email: string,
  locale: PreferredLanguage,
  options: RegisteredOnly,
): Promise<OtpResult<true, RegisteredOnlyError>>;
export async function requestOtp(
  email: string,
  locale: PreferredLanguage,
  options?: RegisteredOnly,
): Promise<OtpResult<true, RegisteredOnlyError>> {
  const result = await apiFetch('/api/v1/auth/otp/request', z.literal(true), {
    method: 'POST',
    body: { email, locale, ...registeredOnlyOf(options) },
  });
  if (result.error !== null) {
    return toOtpFailure(result);
  }
  return { data: true, error: null, retryAfterSec: null };
}

/**
 * Kod doğrulama. Başarıda oturum cihaza yazılır (supabase `setSession` → SecureStore) ve
 * `AuthSession` döner. Biçimsiz kod API'ye HİÇ gitmez (`OtpCodeSchema` — deneme sayacı boşa yanmaz).
 *
 * ── BEKLEYEN DAVET GÖVDEDE DEĞİL, GİRİŞTEN SONRA (21.44 · 21.43'ün düzeltmesi) ──
 * Kod önce bu isteğin gövdesine ekleniyordu ve o çözüm yalnız e-posta yolunu kapsıyordu: Google
 * turu bu uçtan hiç geçmiyor, yani oradan kaydolan davetli sessizce bağsız kalıyordu. Bağlama
 * artık oturum kurulduktan SONRA, giriş yöntemini bilmeyen tek bir kapıdan geçiyor
 * (`claimPendingInvite`) — künyesi ve iki çağıranının gerekçesi orada. 21.310'dan beri o kapıya
 * doğrudan değil, giriş sonrası işler kaydından (`sign-in-effects`) ulaşılıyor: bu dosya ortak
 * çekirdekte ve davet müşteri uygulamasının işi.
 */
export async function verifyOtp(email: string, code: string, locale: PreferredLanguage): Promise<OtpResult<AuthSession>>;
export async function verifyOtp(
  email: string,
  code: string,
  locale: PreferredLanguage,
  options: RegisteredOnly,
): Promise<OtpResult<AuthSession, RegisteredOnlyError>>;
export async function verifyOtp(
  email: string,
  code: string,
  locale: PreferredLanguage,
  options?: RegisteredOnly,
): Promise<OtpResult<AuthSession, RegisteredOnlyError>> {
  if (!OtpCodeSchema.safeParse(code).success) {
    return { data: null, error: 'invalid_code', retryAfterSec: null, offline: false };
  }

  const result = await apiFetch('/api/v1/auth/otp/verify', VerifyResponseSchema, {
    method: 'POST',
    body: { email, code, locale, ...registeredOnlyOf(options) },
  });
  if (result.error !== null) {
    return toOtpFailure(result);
  }

  const { session } = result.data;
  const { error } = await getSupabase().auth.setSession({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
  });
  if (error) {
    // Kod doğruydu ama cihaz oturumu kurulamadı — sunucunun aynı hâl için seçtiği anahtar (502 send_failed).
    return { data: null, error: 'send_failed', retryAfterSec: null, offline: false };
  }

  // Oturum KURULDU: uygulamanın giriş sonrası işleri koşar (müşteride bekleyen davet bağlanır).
  // Beklenmiyor değil — bağın kurulması girişin bir parçası; ama düşerse akış devam eder (kapının
  // kendi künyesi).
  await runSignInEffects();

  return { data: session, error: null, retryAfterSec: null };
}
