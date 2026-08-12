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
import { clearInvite, readInvite } from '../invite/invite-store';
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
 *
 * ── BEKLEYEN DAVET KODU BURADAN GEÇER (21.43) ───────────────────────────────
 * Kodu ekranlar taşımıyor, bu kapı taşıyor — ve bu bilinçli. Uygulamada giriş İKİ yerden
 * yapılıyor (giriş ekranı ve akış içi kimlik adımı `useOtpSignIn`) ve yarın bir üçüncüsü doğarsa
 * o da unutmadan taşımalı. Kodu çağıranlara bıraksaydık, sunucu tarafında yaşanan arızanın
 * aynısını istemcide kurmuş olurduk: bir yüzey bağlamayı unutur, davetli sessizce bağsız kalır,
 * ödül hiç yazılmaz, kimse fark etmez (`application/auth/otp.ts` künyesi, aynı ders).
 *
 * **Kod okunamazsa giriş yine olur:** `readInvite` düşerse `null` döner, gövdeye alan eklenmez.
 * Davet bir kolaylıktır, kimlik değil.
 */
export async function verifyOtp(email: string, code: string, locale: PreferredLanguage): Promise<OtpResult<AuthSession>> {
  if (!OtpCodeSchema.safeParse(code).success) {
    return { data: null, error: 'invalid_code', retryAfterSec: null };
  }

  const referralCode = await readInvite();
  const result = await apiFetch('/api/v1/auth/otp/verify', VerifyResponseSchema, {
    method: 'POST',
    body: { email, code, locale, ...(referralCode === null ? {} : { referralCode }) },
  });
  if (result.error !== null) {
    return { data: null, error: toAuthErrorKey(result.error), retryAfterSec: result.retryAfterSec };
  }

  /* Kod TÜKETİLDİ — bağ kurulmuş olsun ya da olmasın (sunucu yeni müşteri değilse ya da kod
     geçersizse sessizce reddeder). Bırakılsaydı aynı cihazdan kaydolan her kişi aynı kodla
     bağlanmayı denerdi; motor reddeder, yani zarar vermez ama her girişe ölü bir yazma eklerdi. */
  if (referralCode !== null) await clearInvite();

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
