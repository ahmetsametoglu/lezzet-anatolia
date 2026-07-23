'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Locale } from '@lezzet/i18n';
import { createClient } from '@/lib/supabase/client';
import type { Device } from '@/lib/device';
import type { OtpResendResult, OtpVerifyResult } from '@/components/auth/otp-code-input';
import { sendEmailOtp, verifyEmailOtp } from './actions';
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

/** İlk boya sunucu ipucuyla; mount sonrası viewport ölçüsüne göre düzeltilir (tek render ağacı). */
function useDevice(initial: Device): Device {
  const [device, setDevice] = useState<Device>(initial);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => setDevice(mq.matches ? 'mobile' : 'desktop');
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return device;
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

  const onSubmit = handleSubmit((values) => {
    setError(null);
    setNotice(null);
    startSending(async () => {
      const res = await sendEmailOtp(values.email);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setStage({ kind: 'code', email: values.email.trim().toLowerCase() });
    });
  });

  async function onVerify(code: string): Promise<OtpVerifyResult> {
    if (stage.kind !== 'code') return { ok: false, error: copyErrors.invalidEmail };
    const res = await verifyEmailOtp(stage.email, code, next);
    if (res.ok) {
      window.location.assign(res.redirect);
      return { ok: true };
    }
    return { ok: false, error: res.error };
  }

  async function onResend(): Promise<OtpResendResult> {
    if (stage.kind !== 'code') return { ok: false, error: copyErrors.invalidEmail };
    const res = await sendEmailOtp(stage.email);
    return res.ok ? { ok: true } : { ok: false, error: res.error };
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
