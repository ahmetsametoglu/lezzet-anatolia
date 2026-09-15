'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { brand } from '@lezzet/brand';
import type { LocalizedCopy } from '@lezzet/i18n';
import loginMessages from '@lezzet/i18n/customer/login';
import { Link } from '@/i18n/navigation';
import { CODE_LENGTH, type OtpResendResult, type OtpVerifyResult } from '@/components/customer/auth/otp-code-input';
import { CodeField } from '@/components/customer/form/code-field';
import { FormInputField } from '@/components/customer/form/form-input-field';
import { LoadingState } from '@/components/customer/phone-kit/loading-state';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import { BackButton } from '@/components/customer/ui/back-button';
import { MobileCustomerIcon, MobileIcon } from '@/components/customer/ui/mobile-icon';
import type { LoginViewProps } from './login-types';

/*
  Native müşteri girişiyle aynı ekran ve aynı ortak sözlük. Seçim adımı yalnız telefon görünümünde (masaüstü e-postayı
  ilk ekranda açar); kod gönderme, doğrulama ve yönlendirme `login-client`te.
*/

type Copy = LocalizedCopy<typeof loginMessages>;

/** Seçim ekranı ile e-posta formu — kod aşaması `stage`ten gelir. */
type Step = 'choose' | 'email';

export function LoginMobile({ locale, stage, error, isSending, emailInvalid, emailRef, emailField, onSubmit, onBack, onGoogle, onVerify, onResend }: LoginViewProps) {
  const copy: Copy = loginMessages[locale];
  const [step, setStep] = useState<Step>('choose');
  /** Seçim aşamasının bilgi satırı (WhatsApp "yakında"). */
  const [notice, setNotice] = useState<string | null>(null);
  /** Adım derinliği (seçim 0, e-posta 1, kod 2) — geçmişteki adım kayıtlarıyla eşleşir. */
  const depth = stage.kind === 'code' ? 2 : step === 'email' ? 1 : 0;
  /** Bu ekranın geçmişe eklediği adım kaydı sayısı. */
  const pushedSteps = useRef(0);

  /*
    Android'in geri tuşu ve iOS Safari'nin kaydırması tarayıcı geçmişine gider: ileri her adım aynı adresle bir kayıt
    ekler, geri hareketi (‹ dahil) onu çıkarıp adımı geri alır. Next'in `pushState` yaması kendi durumunu kayda
    kopyaladığı için sayfa yenilenmez.
  */
  useEffect(() => {
    while (pushedSteps.current < depth) {
      pushedSteps.current += 1;
      window.history.pushState({ loginStep: pushedSteps.current }, '');
    }
  }, [depth]);

  useEffect(() => {
    const onPopState = () => {
      if (pushedSteps.current === 0) return;
      pushedSteps.current -= 1;
      // Kod → e-posta `login-client`te: yazılan adres formda kalır.
      if (stage.kind === 'code') onBack();
      else setStep('choose');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [stage.kind, onBack]);

  return (
    <main
      // Giriş telefon çerçevesinin dışında; yazı ölçeğini kendisi taşır.
      data-type-scale="phone"
      className="flex min-h-dvh flex-col bg-sand-50 pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] text-ink"
    >
      <div className="flex items-center px-3.5 pt-2">
        <BackButton label={copy.back} fallback="/" />
      </div>

      <div className="flex flex-1 flex-col justify-center gap-4 px-6.5 pt-5 pb-7.5">
        {/* Boy görünür yüksekliğin %20'si, en çok 180: kısa ekranda yollar görünür kalsın. */}
        <img src="/logo-isaret.png" alt={brand.name} className="mb-4 h-[min(180px,20dvh)] self-center" />
        <h1 className="font-serif text-page-title-sm leading-tight text-ink">{copy.title}</h1>
        <p className="font-sans text-control leading-normal font-normal text-body">{copy.body}</p>

        {/* Seçimin üç yolu ve bilgi satırı kadar sabit yer (6 + 3 × 54 + 2 × 10 + 6 + 21): kısa adımlarda ortalanmış blok oynamasın. */}
        <div className="flex min-h-53.75 flex-col">
          {stage.kind === 'code' ? (
            <CodeStep email={stage.email} copy={copy} onVerify={onVerify} onResend={onResend} />
          ) : step === 'choose' ? (
            <div className="mt-1.5 flex flex-col gap-2.5">
              <ProviderButton
                tone="card"
                label={copy.google}
                onClick={() => {
                  setNotice(null);
                  onGoogle();
                }}
                mark={
                  <span aria-hidden className="font-sans text-step font-bold text-brand-google">
                    G
                  </span>
                }
              />
              <ProviderButton tone="card" label={copy.whatsapp} onClick={() => setNotice(copy.whatsappSoon)} mark={<MobileIcon name="whatsapp" size={17} className="text-brand-whatsapp-pure" />} />
              <ProviderButton
                tone="olive"
                label={copy.email}
                onClick={() => {
                  setNotice(null);
                  setStep('email');
                }}
                mark={<MobileCustomerIcon name="mail" size={17} />}
              />
              {notice && <p className="mt-1.5 text-center font-sans text-note font-semibold text-olive-dark">{notice}</p>}
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="mt-1.5 flex flex-col gap-2.5">
              <FormInputField
                label={copy.emailField}
                hideLabel
                variant="pill"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder={copy.emailField}
                error={emailInvalid ? copy.emailInvalid : undefined}
                inputRef={emailRef}
                {...emailField}
              />
              <PrimaryButton type="submit" shape="block" label={isSending ? copy.sending : copy.send} disabled={isSending} />
            </form>
          )}

          {error && stage.kind !== 'code' && (
            <p role="alert" className="mt-2.5 text-center font-sans text-note font-semibold text-terracotta-bright">
              {error}
            </p>
          )}
        </div>

        <p className="mt-2.5 font-sans text-micro leading-normal text-muted">
          {copy.legalPrefix}
          <Link href="/legal/privacy" className="cursor-pointer text-olive underline transition-colors hover:text-olive-dark">
            {copy.privacyInline}
          </Link>
          {copy.legalSuffix}
        </p>
      </div>
    </main>
  );
}

interface ProviderButtonProps {
  label: string;
  /** Sağlayıcının işareti — "G" harfi ya da ikon; renk çağırandan. */
  mark: ReactNode;
  /** `card` — beyaz, kum çerçeveli (Google · WhatsApp); `olive` — dolu zeytin (E-posta). */
  tone: 'card' | 'olive';
  onClick: () => void;
}

/** Yol düğmesi; ölçüler native girişin `providerButton`ıyla aynı. */
function ProviderButton({ label, mark, tone, onClick }: ProviderButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex h-13.5 w-full cursor-pointer items-center gap-3 rounded-pill px-5 transition-[scale,border-color,background-color] active:scale-[0.97]',
        tone === 'card' ? 'border-[1.5px] border-sand-400 bg-card text-ink hover:border-olive' : 'bg-olive text-card hover:bg-olive-dark',
      ].join(' ')}
    >
      {mark}
      <span className="font-sans text-body-sm font-bold">{label}</span>
    </button>
  );
}

interface CodeStepProps {
  email: string;
  copy: Copy;
  onVerify: (code: string) => Promise<OtpVerifyResult>;
  onResend: () => Promise<OtpResendResult>;
}

/** Kod aşaması: tek alan; altı hane girilince doğrulanır. Başarıda yönlendirmeyi `login-client` yapar. */
function CodeStep({ email, copy, onVerify, onResend }: CodeStepProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'input' | 'verifying' | 'done'>('input');
  /** Sunucunun bekleme cezası (sn) — yalnız yeniden gönderme etiketinde sayar. */
  const [cooldownSec, setCooldownSec] = useState(0);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const timer = setTimeout(() => setCooldownSec((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldownSec]);

  const change = (digits: string) => {
    setCode(digits);
    setError(null);
    if (digits.length !== CODE_LENGTH) return;
    setPhase('verifying');
    void onVerify(digits).then((result) => {
      if (result.ok) {
        setPhase('done');
        return;
      }
      // Yanlış kod: alan temizlenir, cümle altında.
      setPhase('input');
      setCode('');
      setError(result.error);
    });
  };

  const resend = () => {
    if (cooldownSec > 0 || resending) return;
    setResending(true);
    setCode('');
    setError(null);
    void onResend().then((result) => {
      setResending(false);
      if (result.ok) {
        if (result.cooldownSec) setCooldownSec(result.cooldownSec);
        return;
      }
      if (result.retryAfterSec) setCooldownSec(result.retryAfterSec);
      setError(result.error);
    });
  };

  if (phase !== 'input') {
    return (
      <div className="flex min-h-15.5 items-center justify-center py-6.5">
        <LoadingState label={phase === 'done' ? copy.done : copy.verifying} />
      </div>
    );
  }

  return (
    <div className="mt-1.5 flex flex-col gap-2.5">
      <p className="font-sans text-control font-semibold text-ink">{copy.sent.replace('{email}', email)}</p>
      <CodeField value={code} onChange={change} label={copy.codeField} placeholder={copy.codePlaceholder} length={CODE_LENGTH} invalid={error !== null} />
      {error && (
        <p role="alert" className="text-center font-sans text-note font-semibold text-terracotta-bright">
          {error}
        </p>
      )}
      <div className="flex justify-center pt-1">
        <TextAction
          label={cooldownSec > 0 ? copy.resendWait.replace('{s}', String(cooldownSec)) : copy.resend}
          onClick={resend}
          disabled={cooldownSec > 0 || resending}
        />
      </div>
    </div>
  );
}
