'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { LocalizedCopy } from '@lezzet/i18n';
import type loginMessages from '@lezzet/i18n/customer/login';
import { Link } from '@/i18n/navigation';
import { CodeField } from '@/components/customer/form/code-field';
import { LoadingState } from '@/components/customer/phone-kit/loading-state';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import { CODE_LENGTH, type OtpResendResult, type OtpVerifyResult } from './otp-code-input';
import { GoogleIcon } from './provider-icons';

/* Telefon girişinin parçaları: giriş sayfası ve sepetin giriş çekmecesi aynı yolları, aynı kod adımını ve aynı gizlilik cümlesini çizer. */

export type LoginCopy = LocalizedCopy<typeof loginMessages>;

interface ProviderButtonProps {
  label: string;
  mark: ReactNode;
  /** `card` — beyaz, kum çerçeveli (Google); `olive` — dolu zeytin (E-posta). */
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

interface ProviderChoiceProps {
  copy: LoginCopy;
  onGoogle: () => void;
  onEmail: () => void;
}

/** Giriş yolları. Google düğmesi Google'ın kuralı gereği resmî renkli "G"yi taşır; yerine harf çizilemez. */
export function ProviderChoice({ copy, onGoogle, onEmail }: ProviderChoiceProps) {
  return (
    <div className="mt-1.5 flex flex-col gap-2.5">
      <ProviderButton tone="card" label={copy.google} onClick={onGoogle} mark={<GoogleIcon />} />
      <ProviderButton tone="olive" label={copy.email} onClick={onEmail} mark={<MobileIcon name="mail" size={17} />} />
    </div>
  );
}

interface PhoneCodeStepProps {
  email: string;
  copy: LoginCopy;
  onVerify: (code: string) => Promise<OtpVerifyResult>;
  onResend: () => Promise<OtpResendResult>;
}

/** Kod aşaması: tek alan; altı hane girilince doğrulanır. Başarıdan sonrasını (yönlendirme ya da tazeleme) çağıran yapar. */
export function PhoneCodeStep({ email, copy, onVerify, onResend }: PhoneCodeStepProps) {
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
      <CodeField
        value={code}
        onChange={change}
        label={copy.codeField}
        placeholder={copy.codePlaceholder}
        length={CODE_LENGTH}
        invalid={error !== null}
      />
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

/** Girişin gizlilik cümlesi; hangi yoldan girilirse girilsin aynı bilgilendirme gösterilir. */
export function LoginLegal({ copy }: { copy: LoginCopy }) {
  return (
    <p className="mt-2.5 font-sans text-micro leading-normal text-body">
      {copy.legalPrefix}
      <Link href="/legal/privacy" className="cursor-pointer text-olive-dark underline transition-colors hover:text-ink">
        {copy.privacyInline}
      </Link>
      {copy.legalSuffix}
    </p>
  );
}
