'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Locale } from '@lezzet/i18n';
import { createClient } from '@/lib/supabase/client';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import { authErrorMessage, type AuthErrorKey } from '@/lib/auth/errors';
import type { OtpResendResult, OtpVerifyResult } from '@/components/customer/auth/otp-code-input';
import { sendEmailOtp, verifyEmailOtp } from '@/lib/auth/otp-actions';
import type { LoginErrors, LoginViewProps, Messages, Stage } from './login-types';
import { LoginDesktop } from './login.desktop';
import { LoginMobile } from './login.mobile';

/** Müşteri OTP girişi (yalnız e-posta). Kod doğrulama OtpCodeInput içinde yapılır. */
const LoginEmailSchema = z.object({
  email: z.string().trim().email(),
});
type LoginEmailValues = z.infer<typeof LoginEmailSchema>;

interface LoginClientProps {
  next: string | null;
  subtitle: string;
  locale: Locale;
  t: Messages;
  errors: LoginErrors;
  initialError?: string | null;
  device: Device;
}

export function LoginClient({ next, subtitle, locale, t, errors: copyErrors, initialError = null, device }: LoginClientProps) {
  const [stage, setStage] = useState<Stage>({ kind: 'email' });
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSending, startSending] = useTransition();
  const resolvedDevice = useDevice(device);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginEmailValues>({
    resolver: zodResolver(LoginEmailSchema),
    defaultValues: { email: '' },
  });

  // register()'in ref'ini FormInputField'in inputRef prop'una ayır; kalanı input'a yayılır.
  const { ref: emailRef, ...emailField } = register('email');

  function onBack() {
    if (stage.kind === 'code') {
      setStage({ kind: 'email' });
      setError(null);
      setNotice(null);
    } else {
      history.back();
    }
  }

  /**
   * Anahtarı CÜMLEYE çevirir — kapı artık metin değil anahtar döndürüyor (denetim S1).
   *
   * `authErrorMessage` saf bir tablo (sunucuya bağlı değil), o yüzden çeviri burada yapılabiliyor
   * ve yüzeyin kuralı korunuyor: kapı anahtar döner, cümleyi ekran kurar (08.15). Anahtar bir
   * şekilde boş gelirse genel e-posta hatasına düşülür — boş bir kırmızı satır göstermek,
   * müşteriye hiçbir şey söylememektir.
   */
  const say = (key: AuthErrorKey | null): string => (key ? authErrorMessage(key, locale) : copyErrors.invalidEmail);

  const onSubmit = handleSubmit((values) => {
    setError(null);
    setNotice(null);
    startSending(async () => {
      const { data, errorKey } = await sendEmailOtp(values.email);
      if (!data) {
        setError(say(errorKey));
        return;
      }
      setStage({ kind: 'code', email: values.email.trim().toLowerCase() });
    });
  });

  async function onVerify(code: string): Promise<OtpVerifyResult> {
    if (stage.kind !== 'code') return { ok: false, error: copyErrors.invalidEmail };
    const { data, errorKey } = await verifyEmailOtp(stage.email, code, next);
    if (data) {
      window.location.assign(data.redirect);
      return { ok: true };
    }
    return { ok: false, error: say(errorKey) };
  }

  async function onResend(): Promise<OtpResendResult> {
    if (stage.kind !== 'code') return { ok: false, error: copyErrors.invalidEmail };
    const { data, errorKey } = await sendEmailOtp(stage.email);
    return data ? { ok: true } : { ok: false, error: say(errorKey) };
  }

  async function onGoogle() {
    setError(null);
    setNotice(null);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`;
    const { error: err } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (err) setError(copyErrors.googleUnavailable);
  }

  // WhatsApp girişi henüz kurulmadı (modül 15); tasarımdaki buton korunur, tıklamada bilgi verir.
  function onWhatsApp() {
    setError(null);
    setNotice(t.whatsappSoon);
  }

  const view: LoginViewProps = {
    t,
    errors: copyErrors,
    subtitle,
    locale,
    stage,
    error,
    notice,
    isSending,
    emailInvalid: !!errors.email,
    emailRef,
    emailField,
    onSubmit,
    onBack,
    onGoogle,
    onWhatsApp,
    onVerify,
    onResend,
  };

  return resolvedDevice === 'mobile' ? <LoginMobile {...view} /> : <LoginDesktop {...view} />;
}
