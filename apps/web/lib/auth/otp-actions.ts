'use server';

import { getLocale } from 'next-intl/server';
import { normalizeEmail } from '@lezzet/helper';
import { brand } from '@lezzet/brand';
import type { Locale } from '@lezzet/i18n';
import { createServiceRoleClient, EmailVerificationService, UserProfileService } from '@lezzet/database';
import { captureError, logger, maskEmail, SOURCES } from '@lezzet/observability';
import { OtpCodeEmail, otpSubject, sendEmail } from '@lezzet/email';
import { createClient } from '@/lib/supabase/server';
import { resolvePostLoginRedirect } from './redirect';
import type { AuthErrorKey } from './errors';
import { seedPreferredLanguage } from '@/lib/identity/preferred-language';

/**
 * **E-posta OTP kapıları — ÜÇ sayfanın paylaştığı oturum açma yolu** (denetim D1, 03.08).
 *
 * Bu dosya `login/actions.ts` idi ve orada durması bir süre doğruydu: tek tüketicisi giriş
 * sayfasıydı. Sonra checkout'un misafir doğrulaması (`guest-verify`) ve Professionnels başvurusu
 * da aynı iki fonksiyonu çağırmaya başladı — üç sayfa, biri sahibi. `CLAUDE.md §2`'nin kuralı
 * tam olarak bunu ayırıyor: *"server action'lar sayfa klasöründe kolokasyon; paylaşılan yardımcı
 * `lib/`"*. Kardeş sayfadan import artık `docs:check` §3e ile de yasak.
 *
 * `lib/auth/` seçildi çünkü ailenin geri kalanı zaten orada: `signOutAction` (`actions.ts`),
 * yönlendirme (`redirect.ts`), hata anahtarları (`errors.ts`). Ad `otp-actions`: `actions.ts`
 * çıkışın evi ve ikisini birleştirmek "auth ne yapıyor" sorusunu tek dosyada 200 satıra çıkarırdı.
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
 * kendine ait hâller.
 */
type AuthResult<T> = { data: T | null; errorKey: AuthErrorKey | null };

/**
 * **Deterministik dev kodu** (00.9 Parti 3b · `docs/talep/musteri-otp-test-kapisi.md`).
 *
 * E2E misafir checkout'un kimlik adımında duruyordu: kod e-postayla gidiyor ve test onu bilemiyor.
 * Kodu bir dosyaya ya da log'a yazmak ÇÖZÜM DEĞİL (`OBSERVABILITY §5`: OTP hiçbir hâlde, maskeli
 * bile yazılmaz — kaydı okuyan biri o kodla giriş yapabilirdi). Geriye tek yol kalıyor: testin
 * bildiği bir kodu kullanmak.
 *
 * **Sınadığı şey akışın TAMAMI:** hash eşleşmesi, süre, deneme sayacı, kilitlenme, tek-kullanım,
 * `auth.users` → `Customer` trigger zinciri. Sabit olan yalnız kodun kendisi — üretimi ve gerçek
 * teslimatı sınamak ayrı bir senaryonun işi (Katman 2).
 *
 * ── İKİ KİLİT, `DEV_AUTH_BYPASS` emsali (`guard.ts`) ─────────────────────────
 *   1. `NODE_ENV === 'production'` → env ne olursa olsun `null`.
 *   2. `OTP_TEST_CODE` VAR ve tam altı rakam olmalı; bozuk değer sessizce yok sayılır.
 * İkincisi bir biçim kontrolünden fazlası: yarım yazılmış bir env değeri "kod sabitlendi" sanılıp
 * gerçek akışı zayıflatamaz — koşul tutmazsa rastgele koda geri düşülür.
 *
 * Kod LOGLANMAZ, uyarı yalnız modun açık olduğunu söyler.
 */
let otpTestWarned = false;

function devOtpCode(): string | null {
  if (process.env.NODE_ENV === 'production') return null;
  const raw = process.env.OTP_TEST_CODE;
  if (!raw || !/^\d{6}$/.test(raw)) return null;
  if (!otpTestWarned) {
    otpTestWarned = true;
    logger.warn({ context: 'auth/otp' }, 'OTP_TEST_CODE AKTİF — sabit doğrulama kodu, mail gönderilmiyor (yalnız dev/test)');
  }
  return raw;
}

/**
 * Tek kullanımlık kod gönderir. Kendi OTP tablomuza (SHA-256 hash) yazar; plain kodu
 * Resend ile yollar. Supabase mail göndermez. Kod sızdırmamak için hata mesajları geneldir.
 */
export async function sendEmailOtp(emailRaw: string): Promise<AuthResult<true>> {
  const email = normalizeEmail(emailRaw);
  if (!email) return { data: null, errorKey: 'invalid_email' };

  const service = new EmailVerificationService(createServiceRoleClient());
  // Deterministik dev kodu: e2e'nin kodu bilebilmesi için (aşağıdaki künye).
  const testCode = devOtpCode();
  const requested = await service.requestCode(email, testCode ?? undefined);
  if (requested.status !== 'ok') return { data: null, errorKey: requested.status };

  // **Test kodundayken Resend'e HİÇ GİDİLMEZ.** Gönderilseydi her e2e koşusu gerçek bir mail
  // üretirdi (kota, gürültü, kontrolsüz alıcı). Kodun kendisi zaten biliniyor; mailin taşıyacağı
  // yeni bir bilgi yok. Gerçek teslimat zinciri ayrı bir senaryonun işi (Katman 2, seyrek koşar).
  if (testCode) return { data: true, errorKey: null };

  // Dil MAİL için okunuyor, hata cümlesi için değil: cümleyi artık ekran kuruyor (`AuthResult`
  // künyesi). Kodun gittiği mailin dili ise sunucuda belli olmak zorunda.
  const locale = (await getLocale()) as Locale;
  const mail = await sendEmail({
    to: email,
    subject: otpSubject(locale, brand.name),
    react: OtpCodeEmail({ code: requested.code, locale, brandName: brand.name }),
  });
  if (mail.error) {
    // Kod ASLA loglanmaz — kaydı okuyan biri o kodla giriş yapabilirdi.
    //
    // İz `error_log`'a da düşer (03.08): giriş yolu **kimliksiz** — `customerId` yok, çünkü müşteri
    // henüz oturum açmadı. Yalnız `logger` yazınca arıza operasyon ekranında hiç görünmüyordu ve
    // e-posta alarmı bilinçli olarak yok (`OBSERVABILITY §4.1`); yani "OTP mailleri gitmiyor"
    // ancak müşteri arayınca öğrenilirdi. Adres MASKELİ: hangi kayıt olduğunu söyler, kim
    // olduğunu söylemez (kullanıcı kararı 03.08).
    await captureError(new Error(`OTP maili gönderilemedi: ${mail.error}`), {
      source: SOURCES.webAction,
      context: { flow: 'auth/sendEmailOtp', email: maskEmail(email) },
    });
    return { data: null, errorKey: 'send_failed' };
  }
  return { data: true, errorKey: null };
}

/**
 * 6 haneli kodu doğrular. Başarılıysa Supabase oturumu **generateLink (admin, mailsiz) +
 * verifyOtp(token_hash)** ile açılır (auth.users yaratılır → trigger Customer'a bağlar),
 * sonra iki-yüzey kuralına göre yönlendirilir.
 */
export async function verifyEmailOtp(emailRaw: string, token: string, next?: string | null): Promise<AuthResult<{ redirect: string }>> {
  const email = normalizeEmail(emailRaw);
  if (!email) return { data: null, errorKey: 'invalid_email' };

  const admin = createServiceRoleClient();
  const service = new EmailVerificationService(admin);
  const verified = await service.verifyCode(email, token.trim());
  if (verified.status !== 'ok') {
    // Servisin durum adı ile müşterinin göreceği anahtar AYRI: `not_found` sistemin sözü
    // ("böyle bir kayıt yok"), `no_active_code` müşterinin anlayacağı hâl ("geçerli kodunuz yok").
    const errorKey: AuthErrorKey =
      verified.status === 'expired'
        ? 'code_expired'
        : verified.status === 'locked'
          ? 'code_locked'
          : verified.status === 'not_found'
            ? 'no_active_code'
            : 'invalid_code';
    return { data: null, errorKey };
  }

  // Kart ZATEN VAR MI — dili yalnız yeni açılana yazacağız (04.9). Ölçüm oturum açılmadan ÖNCE
  // alınmak zorunda: `generateLink` kullanıcıyı yaratınca trigger profili de açar ve sonradan
  // bakan biri "zaten vardı" diye okur.
  const knownBefore = Boolean(await new UserProfileService(admin).findByEmail(email));

  // Oturum aç: generateLink kullanıcı yoksa yaratır (mailsiz), token_hash'i SSR client tüketir → cookie.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr || !link.properties?.hashed_token || !link.user) {
    // `linkErr` null olabilir: bağlantı geldi ama jeton/kullanıcı eksik olan hâl de buraya düşer.
    await captureError(new Error(`generateLink başarısız: ${linkErr?.message ?? 'jeton ya da kullanıcı boş'}`), {
      source: SOURCES.webAction,
      context: { flow: 'auth/verifyEmailOtp', email: maskEmail(email) },
    });
    return { data: null, errorKey: 'send_failed' };
  }

  const supabase = await createClient();
  const { error: sessionErr } = await supabase.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'email' });
  if (sessionErr) {
    await captureError(new Error(`oturum açılamadı: ${sessionErr.message}`), {
      source: SOURCES.webAction,
      context: { flow: 'auth/verifyEmailOtp', email: maskEmail(email) },
    });
    return { data: null, errorKey: 'send_failed' };
  }

  // Yeni müşteri: geldiği dil kartına yazılır. Başarısız olursa giriş bozulmaz — dil bir kolaylıktır,
  // kimlik değil; müşteri Fransızca mail alır ve hesabından değiştirir.
  // Dil burada da MAİL/PROFİL için okunuyor, hata cümlesi için değil (`AuthResult` künyesi).
  if (!knownBefore) await seedPreferredLanguage(link.user.id, (await getLocale()) as Locale).catch(() => undefined);

  const redirect = await resolvePostLoginRedirect(link.user.id, next);
  return { data: { redirect }, errorKey: null };
}
