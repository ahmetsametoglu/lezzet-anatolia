'use server';

import { getLocale } from 'next-intl/server';
import { normalizeEmail } from '@lezzet/helper';
import { brand } from '@lezzet/brand';
import type { Locale } from '@lezzet/i18n';
import { createServiceRoleClient, EmailVerificationService, UserProfileService } from '@lezzet/database';
import { OtpCodeEmail, otpSubject, sendEmail } from '@lezzet/email';
import { createClient } from '@/lib/supabase/server';
import { resolvePostLoginRedirect } from '@/lib/auth/redirect';
import { authErrorMessage } from '@/lib/auth/errors';
import { seedPreferredLanguage } from '@/lib/identity/preferred-language';

type SendResult = { ok: true } | { ok: false; error: string };
type VerifyResult = { ok: true; redirect: string } | { ok: false; error: string };

/**
 * Tek kullanımlık kod gönderir. Kendi OTP tablomuza (SHA-256 hash) yazar; plain kodu
 * Resend ile yollar. Supabase mail göndermez. Kod sızdırmamak için hata mesajları geneldir.
 */
export async function sendEmailOtp(emailRaw: string): Promise<SendResult> {
  const locale = (await getLocale()) as Locale;
  const email = normalizeEmail(emailRaw);
  if (!email) return { ok: false, error: authErrorMessage('invalid_email', locale) };

  const service = new EmailVerificationService(createServiceRoleClient());
  const requested = await service.requestCode(email);
  if (requested.status !== 'ok') return { ok: false, error: authErrorMessage(requested.status, locale) };

  const mail = await sendEmail({
    to: email,
    subject: otpSubject(locale, brand.name),
    react: OtpCodeEmail({ code: requested.code, locale, brandName: brand.name }),
  });
  if (mail.error) {
    console.error('[sendEmailOtp] mail gönderilemedi:', mail.error);
    return { ok: false, error: authErrorMessage('send_failed', locale) };
  }
  return { ok: true };
}

/**
 * 6 haneli kodu doğrular. Başarılıysa Supabase oturumu **generateLink (admin, mailsiz) +
 * verifyOtp(token_hash)** ile açılır (auth.users yaratılır → trigger Customer'a bağlar),
 * sonra iki-yüzey kuralına göre yönlendirilir.
 */
export async function verifyEmailOtp(emailRaw: string, token: string, next?: string | null): Promise<VerifyResult> {
  const locale = (await getLocale()) as Locale;
  const email = normalizeEmail(emailRaw);
  if (!email) return { ok: false, error: authErrorMessage('invalid_email', locale) };

  const admin = createServiceRoleClient();
  const service = new EmailVerificationService(admin);
  const verified = await service.verifyCode(email, token.trim());
  if (verified.status !== 'ok') {
    const key =
      verified.status === 'expired'
        ? 'code_expired'
        : verified.status === 'locked'
          ? 'code_locked'
          : verified.status === 'not_found'
            ? 'no_active_code'
            : 'invalid_code';
    return { ok: false, error: authErrorMessage(key, locale) };
  }

  // Kart ZATEN VAR MI — dili yalnız yeni açılana yazacağız (04.9). Ölçüm oturum açılmadan ÖNCE
  // alınmak zorunda: `generateLink` kullanıcıyı yaratınca trigger profili de açar ve sonradan
  // bakan biri "zaten vardı" diye okur.
  const knownBefore = Boolean(await new UserProfileService(admin).findByEmail(email));

  // Oturum aç: generateLink kullanıcı yoksa yaratır (mailsiz), token_hash'i SSR client tüketir → cookie.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr || !link.properties?.hashed_token || !link.user) {
    console.error('[verifyEmailOtp] generateLink hatası:', linkErr);
    return { ok: false, error: authErrorMessage('send_failed', locale) };
  }

  const supabase = await createClient();
  const { error: sessionErr } = await supabase.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'email' });
  if (sessionErr) {
    console.error('[verifyEmailOtp] verifyOtp hatası:', sessionErr);
    return { ok: false, error: authErrorMessage('send_failed', locale) };
  }

  // Yeni müşteri: geldiği dil kartına yazılır. Başarısız olursa giriş bozulmaz — dil bir kolaylıktır,
  // kimlik değil; müşteri Fransızca mail alır ve hesabından değiştirir.
  if (!knownBefore) await seedPreferredLanguage(link.user.id, locale).catch(() => undefined);

  const redirect = await resolvePostLoginRedirect(link.user.id, next);
  return { ok: true, redirect };
}
