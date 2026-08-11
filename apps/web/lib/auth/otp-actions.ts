'use server';

import { getLocale } from 'next-intl/server';
import { requestOtpCode, verifyOtpCode } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { captureError, SOURCES } from '@lezzet/observability';
import type { Locale } from '@lezzet/i18n';
import { createClient } from '@/lib/supabase/server';
import { forgetInvite, readInvite } from '@/lib/identity/invite-cookie';
import { resolvePostLoginRedirect } from './redirect';
import type { AuthErrorKey } from './errors';

/**
 * **E-posta OTP kapıları — ÜÇ sayfanın paylaştığı oturum açma yolu** (denetim D1, 03.08).
 *
 * Bu dosya `login/actions.ts` idi ve orada durması bir süre doğruydu: tek tüketicisi giriş
 * sayfasıydı. Sonra checkout'un misafir doğrulaması (`guest-verify`) ve Professionnels başvurusu
 * da aynı iki fonksiyonu çağırmaya başladı — üç sayfa, biri sahibi. `CLAUDE.md §2`'nin kuralı
 * tam olarak bunu ayırıyor: *"server action'lar sayfa klasöründe kolokasyon; paylaşılan yardımcı
 * `lib/`"*. Kardeş sayfadan import artık `docs:check` §3e ile de yasak.
 *
 * ── AKIŞIN SAHİBİ ARTIK BU DOSYA DEĞİL (21.4, benimseme 07.08) ───────────────
 * Kod isteme + doğrulama + `generateLink` + dil tohumu orkestrasyonu `@lezzet/application/auth`ta:
 * mobil `/api/v1/auth/otp/*` uçları da aynı akışı çağırıyor. Bu dosya bir süre o akışın İKİNCİ
 * kopyasıydı (geçiş köprüsü) — iki kopyanın bir gün birbirinden ayrışması an meselesiydi ve
 * ayrıştığı gün fark, "girişte neden mobilde başka davranıyor" diye aranırdı.
 *
 * Geriye kalan İKİ iş gerçekten TAŞIMAYA ait ve bilerek burada:
 *   1. **Dil** — webde `getLocale()` (istek bağlamı), mobilde istek gövdesi. Paket parametre alır.
 *   2. **`hashedToken` tüketimi** — `verifyOtp(token_hash)` oturumu bir İSTEMCİYE yazar; web onu
 *      SSR çerez istemcisiyle tüketir (oturum çereze düşer), mobil kısa ömürlü anon istemciyle
 *      tüketip session'ı gövdeyle cihaza verir. Paket tüketseydi paylaşılan service-role tekiline
 *      oturum yazılır, sonraki TÜM PostgREST istekleri o kullanıcının token'ıyla giderdi.
 * Yönlendirme de (`resolvePostLoginRedirect`) webin işi: mobilde "sonraki sayfa" diye bir şey yok.
 */

/**
 * **Yüzeyin TEK dönüş sözleşmesi** (`CustomerResult`) — denetim S1.
 *
 * Bu iki fonksiyon bir ara `{ ok, error }` dönüyordu: çalışan ve tipli bir şekildi, ama yüzeyde
 * ikinci bir sözleşme yaşatıyordu ve login'i örnek alan bir sonraki oturumsuz action üçüncü
 * varyantı doğururdu. Ayrı şeklin taşıdığı bir bilgi de yoktu.
 *
 * **`error` değil `errorKey` dönüyor** ve fark burada esas: 08.15'te bütün müşteri kapıları
 * metin değil ANAHTAR döndürmeye geçti — cümleyi ekran kurar. Login bunun dışında kalmıştı ve
 * hazır cümle taşıyordu; `authErrorMessage` zaten saf bir tablo (sunucuya bağlı değil), yani
 * çeviriyi istemcide yapmanın maliyeti sıfır.
 *
 * Anahtar kümesi `AuthErrorKey` — `SHARED_ERROR_KEYS`e değil ona bağlı, çünkü bu akışın hataları
 * (`code_expired`, `code_locked`, `cooldown`) yüzeyin geri kalanında karşılığı olmayan, tamamen
 * kendine ait hâller. Paketin durum adları bu kümeyle hizalı (`AuthErrorKeyEnum`, packages/types):
 * aradaki eşleme tablosu bu yüzden YOK — olsaydı iki adın ayrışmasını gizlerdi.
 */
type AuthResult<T> = { data: T | null; errorKey: AuthErrorKey | null };

/**
 * Tek kullanımlık kod gönderir. Kendi OTP tablomuza (SHA-256 hash) yazılır; plain kodu Resend
 * yollar — Supabase mail göndermez. Rate limit / cooldown / kilit DB'de, yani taşımadan bağımsız.
 *
 * Dil MAİL için okunuyor, hata cümlesi için değil: cümleyi ekran kuruyor (`AuthResult` künyesi).
 * Kodun gittiği mailin dili ise sunucuda belli olmak zorunda.
 */
export async function sendEmailOtp(emailRaw: string): Promise<AuthResult<true>> {
  const locale = (await getLocale()) as Locale;
  const result = await requestOtpCode(serviceDb(), { email: emailRaw, locale });
  return result.status === 'ok' ? { data: true, errorKey: null } : { data: null, errorKey: result.status };
}

/**
 * 6 haneli kodu doğrular. Başarılıysa Supabase oturumu **generateLink (admin, mailsiz) +
 * verifyOtp(token_hash)** ile açılır (auth.users yaratılır → trigger Customer'a bağlar),
 * sonra iki-yüzey kuralına göre yönlendirilir.
 */
export async function verifyEmailOtp(emailRaw: string, token: string, next?: string | null): Promise<AuthResult<{ redirect: string }>> {
  const locale = (await getLocale()) as Locale;
  // Davet kodu ziyaretten beri çerezde bekliyor (17.9). Paket onu YALNIZ yeni müşteride kullanır;
  // burada koşul yok — "yeni mi" sorusunun tek doğru cevabı orada, kartın doğduğu yerde.
  const referralCode = await readInvite();
  const verified = await verifyOtpCode(serviceDb(), { email: emailRaw, code: token, locale, referralCode });
  if (verified.status !== 'ok') return { data: null, errorKey: verified.status };

  // Kod TÜKETİLDİ — bağ kurulsun ya da kurulmasın çerez düşer (`invite-cookie` künyesi). Kimlik
  // adımı geçtikten sonra çağrılıyor: kod yanlış girilip akış yarıda kalırsa davet kaybolmasın.
  await forgetInvite();

  // Jetonu SSR istemcisi tüketir: oturum çereze düşer (yukarıdaki künye — taşımanın işi).
  const supabase = await createClient();
  const { error: sessionErr } = await supabase.auth.verifyOtp({ token_hash: verified.hashedToken, type: 'email' });
  if (sessionErr) {
    // Bağlama KİMLİK yazılıyor, adres değil (CLAUDE §1): bu noktada `authUserId` elimizde —
    // maskeli e-postaya düşmenin gerekçesi kalmadı, kimlik zaten kaydı tek başına bulduruyor.
    await captureError(new Error(`oturum açılamadı: ${sessionErr.message}`), {
      source: SOURCES.webAction,
      context: { flow: 'auth/verifyEmailOtp', authUserId: verified.userId },
    });
    return { data: null, errorKey: 'send_failed' };
  }

  const redirect = await resolvePostLoginRedirect(verified.userId, next);
  return { data: { redirect }, errorKey: null };
}
