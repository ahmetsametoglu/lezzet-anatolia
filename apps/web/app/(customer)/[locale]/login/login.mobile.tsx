'use client';

import { useEffect, useRef, useState } from 'react';
import { brand } from '@lezzet/brand';
import loginMessages from '@lezzet/i18n/customer/login';
import { LoginLegal, PhoneCodeStep, ProviderChoice, type LoginCopy } from '@/components/customer/auth/phone-login';
import { FormInputField } from '@/components/customer/form/form-input-field';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { BackButton } from '@/components/customer/ui/back-button';
import type { LoginViewProps } from './login-types';

/*
  Native müşteri girişiyle aynı ekran ve aynı ortak sözlük. Seçim adımı yalnız telefon görünümünde (masaüstü e-postayı
  ilk ekranda açar); kod gönderme, doğrulama ve yönlendirme `login-client`te.
*/

/** Seçim ekranı ile e-posta formu — kod aşaması `stage`ten gelir. */
type Step = 'choose' | 'email';

export function LoginMobile({ locale, stage, error, isSending, emailInvalid, emailRef, emailField, onSubmit, onBack, onGoogle, onVerify, onResend }: LoginViewProps) {
  const copy: LoginCopy = loginMessages[locale];
  const [step, setStep] = useState<Step>('choose');
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

        {/* En uzun adım olan kod adımı kadar sabit yer (iki satırlık gönderim cümlesiyle 158px): adımlar arasında ortalanmış blok oynamasın. */}
        <div className="flex min-h-39.5 flex-col">
          {stage.kind === 'code' ? (
            <PhoneCodeStep email={stage.email} copy={copy} onVerify={onVerify} onResend={onResend} />
          ) : step === 'choose' ? (
            <ProviderChoice copy={copy} onGoogle={onGoogle} onEmail={() => setStep('email')} />
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

        <LoginLegal copy={copy} />
      </div>
    </main>
  );
}
