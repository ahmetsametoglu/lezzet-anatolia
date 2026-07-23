'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Locale } from '@lezzet/i18n';
import { createClient } from '@/lib/supabase/client';
import { OtpCodeInput, type OtpResendResult, type OtpVerifyResult } from '@/components/auth/otp-code-input';
import { FormInputField } from '@/components/form/form-input-field';
import { Button } from '@/components/ui/button';
import { sendEmailOtp, verifyEmailOtp } from './actions';
import type { Messages } from './page';

/** Müşteri OTP girişi (yalnız e-posta). Kod doğrulama OtpCodeInput içinde yapılır. */
const LoginEmailSchema = z.object({
  email: z.string().trim().email(),
});
type LoginEmailValues = z.infer<typeof LoginEmailSchema>;

/** Auth hata metinleri (lib/auth/errors.ts kaynaklı, seçili dilde). */
type LoginErrors = { invalidEmail: string; googleUnavailable: string };

interface LoginFormProps {
  next: string | null;
  subtitle: string;
  locale: Locale;
  t: Messages;
  errors: LoginErrors;
  initialError?: string | null;
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.06 12.25c0-.85-.08-1.67-.22-2.45H12v4.64h6.2a5.3 5.3 0 0 1-2.3 3.48v2.9h3.72c2.18-2 3.44-4.96 3.44-8.57z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.11 0 5.72-1.03 7.62-2.79l-3.72-2.9c-1.03.7-2.35 1.11-3.9 1.11-3 0-5.54-2.02-6.45-4.75H1.7v2.98A12 12 0 0 0 12 24z"
      />
      <path fill="#FBBC05" d="M5.55 14.67a7.2 7.2 0 0 1 0-4.6V7.09H1.7a12 12 0 0 0 0 10.56l3.85-2.98z" />
      <path
        fill="#EA4335"
        d="M12 4.75c1.69 0 3.21.58 4.4 1.72l3.3-3.3C17.72 1.24 15.11 0 12 0A12 12 0 0 0 1.7 7.09l3.85 2.98C6.46 6.77 9 4.75 12 4.75z"
      />
    </svg>
  );
}

type Stage = { kind: 'email' } | { kind: 'code'; email: string };

export function LoginForm({ next, subtitle, locale, t, errors: copyErrors, initialError = null }: LoginFormProps) {
  const [stage, setStage] = useState<Stage>({ kind: 'email' });
  const [error, setError] = useState<string | null>(initialError);
  const [isSending, startSending] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginEmailValues>({
    resolver: zodResolver(LoginEmailSchema),
    defaultValues: { email: '' },
  });

  // register()'in ref'ini FormInputField'in inputRef prop'una ayır (fonksiyon component'e
  // doğrudan ref geçilemez); kalan alanlar (name/onChange/onBlur) input'a yayılır.
  const { ref: emailRef, ...emailField } = register('email');

  function onSubmitEmail(values: LoginEmailValues) {
    setError(null);
    startSending(async () => {
      const res = await sendEmailOtp(values.email);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setStage({ kind: 'code', email: values.email.trim().toLowerCase() });
    });
  }

  async function handleVerify(code: string): Promise<OtpVerifyResult> {
    if (stage.kind !== 'code') return { ok: false, error: copyErrors.invalidEmail };
    const res = await verifyEmailOtp(stage.email, code, next);
    if (res.ok) {
      window.location.assign(res.redirect);
      return { ok: true };
    }
    return { ok: false, error: res.error };
  }

  async function handleResend(): Promise<OtpResendResult> {
    if (stage.kind !== 'code') return { ok: false, error: copyErrors.invalidEmail };
    const res = await sendEmailOtp(stage.email);
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  }

  async function google() {
    setError(null);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`;
    const { error: err } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (err) setError(copyErrors.googleUnavailable);
  }

  return (
    <div className="w-full max-w-[400px] overflow-hidden rounded-[28px] bg-cream shadow-[0_8px_40px_rgba(58,65,71,.15)]">
      {/* Başlık barı */}
      <div className="flex items-center justify-between px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => (stage.kind === 'code' ? (setStage({ kind: 'email' }), setError(null)) : history.back())}
        >
          {t.back}
        </Button>
        <span className="font-serif text-lg font-semibold text-olive">Lezzet Anatolia</span>
        <span className="w-10" />
      </div>

      <div className="flex flex-col gap-4 px-6 pb-10 pt-4">
        {stage.kind === 'email' ? (
          <form onSubmit={handleSubmit(onSubmitEmail)} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-2 text-center">
              <h1 className="font-serif text-[26px] font-semibold leading-tight text-ink">{t.title}</h1>
              <p className="font-sans text-sm leading-relaxed text-body">{subtitle}</p>
            </div>

            <Button variant="secondary" fullWidth onClick={google}>
              <GoogleIcon /> {t.googleCta}
            </Button>

            <div className="flex items-center gap-3 font-sans text-[13px] text-faint">
              <span className="h-px flex-1 bg-line-soft" />
              {t.orEmail}
              <span className="h-px flex-1 bg-line-soft" />
            </div>

            <FormInputField
              label={t.emailPlaceholder}
              hideLabel
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={t.emailPlaceholder}
              error={errors.email ? copyErrors.invalidEmail : undefined}
              inputRef={emailRef}
              {...emailField}
            />

            <Button type="submit" fullWidth disabled={isSending}>
              {isSending ? t.sending : t.sendCta}
            </Button>

            {error && <p className="text-center font-sans text-[13px] font-semibold text-danger">{error}</p>}

            <p className="text-center font-sans text-xs leading-relaxed text-muted">
              {t.consentBefore}
              <span className="text-olive">{t.consentLink}</span>
              {t.consentAfter}
            </p>
          </form>
        ) : (
          <>
            <div className="flex flex-col gap-2 text-center">
              <h1 className="font-serif text-2xl font-semibold leading-tight text-ink">{t.codeTitle}</h1>
            </div>
            <OtpCodeInput email={stage.email} locale={locale} onVerify={handleVerify} onResend={handleResend} />
          </>
        )}
      </div>
    </div>
  );
}
