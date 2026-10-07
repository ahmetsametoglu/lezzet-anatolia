'use client';

import { useState } from 'react';
import { isValidEmail } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import loginMessages from '@lezzet/i18n/customer/login';
import { AuthErrorKeyEnum } from '@lezzet/types';
import type { OtpResendResult, OtpVerifyResult } from '@/components/customer/auth/otp-code-input';
import { PhoneCodeStep } from '@/components/customer/auth/phone-login';
import { FormInputField } from '@/components/customer/form/form-input-field';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { Dialog } from '@/components/customer/ui/dialog';
import { authErrorMessage } from '@/lib/auth/errors';
import type { ProfessionalsCopy } from '../professionals-types';
import { NETWORK_ERROR, type useApplicationForm } from '../use-application-form.hook';

interface PhoneIdentitySheetProps {
  copy: ProfessionalsCopy;
  locale: Locale;
  form: ReturnType<typeof useApplicationForm>;
  /** Kod doğrulandı ve başvuru yazıldı. */
  onApplied: () => void;
  onClose: () => void;
}

/** Misafirin kimlik adımı: e-posta, sonra kod; kod doğrulanınca başvuru formdaki gövdeyle gider. Kapatılırsa form olduğu gibi kalır. */
export function PhoneIdentitySheet({ copy, locale, form, onApplied, onClose }: PhoneIdentitySheetProps) {
  const login = loginMessages[locale];
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) return setError(copy.identity.emailInvalid);
    setError(null);
    const failed = await form.sendCode(trimmed);
    if (failed !== null) return setError(authErrorMessage(failed, locale));
    setSentTo(trimmed);
  };

  // Anahtar ya kod doğrulamasının (giriş sayfasıyla ortak cümle) ya başvurunundur; başvurunun anahtarlarının müşteriye söyleyecek ayrı bir sözü yok.
  const say = (key: string): string => {
    const auth = AuthErrorKeyEnum.safeParse(key);
    if (auth.success) return authErrorMessage(auth.data, locale);
    return key === NETWORK_ERROR ? copy.errors.network : copy.errors.unexpected;
  };

  const verify = async (code: string): Promise<OtpVerifyResult> => {
    if (sentTo === null) return { ok: false, error: copy.errors.unexpected };
    const failed = await form.verifyAndApply(sentTo, code);
    if (failed !== null) return { ok: false, error: say(failed) };
    onApplied();
    return { ok: true };
  };

  const resend = async (): Promise<OtpResendResult> => {
    if (sentTo === null) return { ok: false, error: copy.errors.unexpected };
    const failed = await form.sendCode(sentTo);
    return failed === null ? { ok: true } : { ok: false, error: authErrorMessage(failed, locale) };
  };

  return (
    <Dialog placement="sheet" title={copy.identity.sheetTitle} closeLabel={login.close} onClose={onClose}>
      <div className="flex flex-col gap-2.5 pb-2">
        {sentTo === null ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
            noValidate
            className="flex flex-col gap-2.5"
          >
            <p className="font-sans text-body-sm leading-[1.6] text-muted">{copy.identity.intro}</p>
            <p className="font-sans text-helper font-semibold text-ink">{copy.identity.emailPrompt}</p>
            <FormInputField
              label={copy.identity.emailLabel}
              hideLabel
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={copy.identity.emailPlaceholder}
              value={email}
              error={error ?? undefined}
              onChange={(event) => {
                setEmail(event.target.value);
                setError(null);
              }}
            />
            <PrimaryButton type="submit" shape="block" label={form.pending ? copy.identity.sending : copy.identity.send} disabled={form.pending} />
          </form>
        ) : (
          <PhoneCodeStep
            email={sentTo}
            copy={{
              ...login,
              sent: copy.identity.sent,
              codeField: copy.identity.codeField,
              codePlaceholder: copy.identity.codePlaceholder,
              resend: copy.identity.resend,
              resendWait: copy.identity.resendWait,
              verifying: copy.identity.verifying,
            }}
            onVerify={verify}
            onResend={resend}
          />
        )}
      </div>
    </Dialog>
  );
}
