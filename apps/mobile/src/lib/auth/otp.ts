import {
  AuthErrorKeyEnum,
  AuthSessionSchema,
  OtpCodeSchema,
  type AuthErrorKey,
  type AuthSession,
  type PreferredLanguage,
} from '@lezzet/types';
import { z } from 'zod';
import { apiFetch } from '../api/client';
import { getSupabase } from './supabase';

/*
  OTP akışının cihaz ucu — uçlar apps/mobile-api `/api/v1/auth/otp/*`, şemalar @lezzet/types
  (sözleşme tek kaynak; cevap AYNI Zod şemasıyla parse edilir, 02-mimari §3.2).
  UI YOK: bu katman veri döner, cümleyi ekran kurar (anahtar → metin eşlemesi ekran sözlüğünde).
*/

/**
 * Auth sonucu — hata anahtarı `AuthErrorKeyEnum`'dan TİPLİDİR; 429'da bekleme süresi taşınır.
 * Bilerek İHRAÇ EDİLMİYOR: bugün tüketeni yok (knip ölü ihracı yakalar — mobile-api `Me` emsali);
 * ekranlar gelince ihraç açılır ya da tüketen `ReturnType` ile türetir.
 */
type OtpResult<T> = { data: T; error: null; retryAfterSec: null } | { data: null; error: AuthErrorKey; retryAfterSec: number | null };

/**
 * Telin/istemcinin serbest hata dizgesini tipli anahtara indirger. Enum dışı her şey (ağ yok,
 * bozuk gövde, beklenmedik anahtar) müşteri dilinde `send_failed`tir — sunucunun "kod doğruydu
 * ama oturum kurulamadı" hâline seçtiği anahtarla aynı (auth-otp.ts 502 kararı): müşteri hâlleri
 * kümesine istemci-içi ayrıntı sızdırılmaz, ayrıntıyla ne yapılacağı log altyapısının işi olacak.
 */
function toAuthErrorKey(error: string): AuthErrorKey {
  const parsed = AuthErrorKeyEnum.safeParse(error);
  return parsed.success ? parsed.data : 'send_failed';
}

const VerifyResponseSchema = z.object({ session: AuthSessionSchema });

/** Kod isteği. 429'da (`rate_limit`/`cooldown`) `retryAfterSec` doludur — geri sayımı ekran kurar. */
export async function requestOtp(email: string, locale: PreferredLanguage): Promise<OtpResult<true>> {
  const result = await apiFetch('/api/v1/auth/otp/request', z.literal(true), {
    method: 'POST',
    body: { email, locale },
  });
  if (result.error !== null) {
    return { data: null, error: toAuthErrorKey(result.error), retryAfterSec: result.retryAfterSec };
  }
  return { data: true, error: null, retryAfterSec: null };
}

/**
 * Kod doğrulama. Başarıda oturum cihaza yazılır (supabase `setSession` → SecureStore) ve
 * `AuthSession` döner. Biçimsiz kod API'ye HİÇ gitmez (`OtpCodeSchema` — deneme sayacı boşa yanmaz).
 */
export async function verifyOtp(email: string, code: string, locale: PreferredLanguage): Promise<OtpResult<AuthSession>> {
  if (!OtpCodeSchema.safeParse(code).success) {
    return { data: null, error: 'invalid_code', retryAfterSec: null };
  }

  const result = await apiFetch('/api/v1/auth/otp/verify', VerifyResponseSchema, {
    method: 'POST',
    body: { email, code, locale },
  });
  if (result.error !== null) {
    return { data: null, error: toAuthErrorKey(result.error), retryAfterSec: result.retryAfterSec };
  }

  const { session } = result.data;
  const { error } = await getSupabase().auth.setSession({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
  });
  if (error) {
    // Kod doğruydu ama cihaz oturumu kurulamadı — sunucunun aynı hâl için seçtiği anahtar (502 send_failed).
    return { data: null, error: 'send_failed', retryAfterSec: null };
  }

  return { data: session, error: null, retryAfterSec: null };
}
