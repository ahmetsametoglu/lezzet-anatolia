'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import cartMessages from '@lezzet/i18n/customer/cart';
import loginMessages from '@lezzet/i18n/customer/login';
import { LoginLegal, PhoneCodeStep, ProviderChoice } from '@/components/customer/auth/phone-login';
import type { OtpVerifyResult } from '@/components/customer/auth/otp-code-input';
import { FormInputField } from '@/components/customer/form/form-input-field';
import { DashedInvite } from '@/components/customer/phone-kit/dashed-invite';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { Dialog } from '@/components/customer/ui/dialog';
import { authErrorMessage } from '@/lib/auth/errors';
import { useCartLogin } from '../use-cart-login.hook';

interface PhoneCartLoginProps {
  locale: Locale;
}

/**
 * Telefonda girişsiz müşterinin sepet kartı: giriş sepetin üstünde açılan çekmecede yapılır ve müşteri sepetten ayrılmaz (tasarımın ayrı
 * giriş ekranından bilinçli sapma). Çekmece giriş sayfasının yollarını ve kod adımını kullanır.
 */
export function PhoneCartLogin({ locale }: PhoneCartLoginProps) {
  const copy = cartMessages[locale].guest;
  const [open, setOpen] = useState(false);
  return (
    <>
      <DashedInvite
        title={copy.title}
        description={copy.body}
        action={<PrimaryButton label={copy.cta} shape="pill" onClick={() => setOpen(true)} />}
      />
      {open && <LoginSheet locale={locale} onClose={() => setOpen(false)} />}
    </>
  );
}

interface LoginSheetProps {
  locale: Locale;
  onClose: () => void;
}

/** Seçim → e-posta → kod; kapatılıp yeniden açılan çekmece seçimden başlar. Doğrulanınca sayfa tazelenir ve kart hesaba döner. */
function LoginSheet({ locale, onClose }: LoginSheetProps) {
  const copy = loginMessages[locale];
  const login = useCartLogin(locale, authErrorMessage('google_unavailable', locale));
  const [step, setStep] = useState<'choose' | 'email'>('choose');

  const verify = async (code: string): Promise<OtpVerifyResult> => {
    const result = await login.verify(code);
    if (result.ok) login.verified();
    return result;
  };

  return (
    <Dialog placement="sheet" title={copy.title} description={copy.body} closeLabel={copy.close} onClose={onClose}>
      <div className="flex flex-col pb-2">
        {login.sent ? (
          <PhoneCodeStep email={login.trimmed} copy={copy} onVerify={verify} onResend={login.resend} />
        ) : step === 'choose' ? (
          <ProviderChoice copy={copy} onGoogle={() => void login.google()} onEmail={() => setStep('email')} />
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void login.send();
            }}
            noValidate
            className="mt-1.5 flex flex-col gap-2.5"
          >
            <FormInputField
              label={copy.emailField}
              hideLabel
              variant="pill"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={copy.emailField}
              value={login.email}
              onChange={(event) => login.setEmail(event.target.value)}
            />
            <PrimaryButton
              type="submit"
              shape="block"
              label={login.busy ? copy.sending : copy.send}
              disabled={login.busy || !login.validEmail}
            />
          </form>
        )}

        {login.error && !login.sent && (
          <p role="alert" className="mt-2.5 text-center font-sans text-note font-semibold text-terracotta-bright">
            {login.error}
          </p>
        )}
        <LoginLegal copy={copy} />
      </div>
    </Dialog>
  );
}
