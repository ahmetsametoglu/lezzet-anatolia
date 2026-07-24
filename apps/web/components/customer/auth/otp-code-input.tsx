'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import type { Locale } from '@lezzet/i18n';
import { Button } from '@/components/customer/ui/button';

const CODE_LENGTH = 6;

export type OtpVerifyResult = { ok: true } | { ok: false; error: string };
export type OtpResendResult = { ok: true; cooldownSec?: number } | { ok: false; error: string; retryAfterSec?: number };

interface Props {
  email: string;
  locale: Locale;
  initialCooldownSec?: number;
  onVerify: (code: string) => Promise<OtpVerifyResult>;
  onResend: () => Promise<OtpResendResult>;
  /** Doğrulama başarılıysa parent yönlendirmeyi tetikler. */
  onSuccess?: () => void;
}

type Feedback = { kind: 'idle' } | { kind: 'verifying' } | { kind: 'error'; message: string } | { kind: 'success' };

/** Component'in kendi arayüz metinleri (domain hataları çağırandan gelir, zaten yerelleşmiştir). */
const LABELS: Record<
  Locale,
  Record<'verifying' | 'success' | 'resendPrompt' | 'resend' | 'resending' | 'resent', string> & { sentTo: (email: string) => string }
> = {
  tr: {
    verifying: 'Doğrulanıyor…',
    success: '✓ Doğrulandı',
    resendPrompt: 'Kod gelmedi mi?',
    resend: 'Yeniden gönder',
    resending: 'Gönderiliyor…',
    resent: 'Yeni kod gönderildi.',
    sentTo: (email) => `Kod ${email} adresine gönderildi.`,
  },
  fr: {
    verifying: 'Vérification…',
    success: '✓ Vérifié',
    resendPrompt: 'Pas reçu ?',
    resend: 'Renvoyer le code',
    resending: 'Envoi…',
    resent: 'Nouveau code envoyé.',
    sentTo: (email) => `Code envoyé à ${email}.`,
  },
  de: {
    verifying: 'Wird geprüft…',
    success: '✓ Bestätigt',
    resendPrompt: 'Keinen Code erhalten?',
    resend: 'Erneut senden',
    resending: 'Wird gesendet…',
    resent: 'Neuer Code gesendet.',
    sentTo: (email) => `Code an ${email} gesendet.`,
  },
};

/**
 * Yeniden-kullanılabilir 6 haneli OTP girişi. Paste, son hanede otomatik gönderim,
 * backspace/ok navigasyonu ve geri-sayımlı yeniden-gönderim içerir. Alan-özel aksiyon
 * `onVerify`/`onResend` callback'leriyle sağlanır (checkout, e-posta değişimi vb. paylaşır).
 */
export function OtpCodeInput({ email, locale, initialCooldownSec = 45, onVerify, onResend, onSuccess }: Props) {
  const t = LABELS[locale];
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [feedback, setFeedback] = useState<Feedback>({ kind: 'idle' });
  const [cooldownSec, setCooldownSec] = useState(initialCooldownSec);
  const [resendFeedback, setResendFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isResending, startResendTransition] = useTransition();
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const submittingRef = useRef(false);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const timer = setInterval(() => setCooldownSec((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldownSec]);

  const submit = useCallback(
    (code: string) => {
      if (code.length !== CODE_LENGTH || submittingRef.current) return;
      submittingRef.current = true;
      setFeedback({ kind: 'verifying' });
      startTransition(async () => {
        const res = await onVerify(code);
        if (res.ok) {
          setFeedback({ kind: 'success' });
          onSuccess?.();
          return;
        }
        submittingRef.current = false;
        setFeedback({ kind: 'error', message: res.error });
        setDigits(Array(CODE_LENGTH).fill(''));
        inputsRef.current[0]?.focus();
      });
    },
    [onVerify, onSuccess],
  );

  function handleChange(index: number, raw: string) {
    const value = raw.replace(/\D/g, '');
    if (!value) {
      const next = [...digits];
      next[index] = '';
      setDigits(next);
      return;
    }
    const chars = value.slice(0, CODE_LENGTH - index).split('');
    const next = [...digits];
    chars.forEach((ch, i) => {
      if (index + i < CODE_LENGTH) next[index + i] = ch;
    });
    setDigits(next);

    const lastFilled = Math.min(index + chars.length - 1, CODE_LENGTH - 1);
    requestAnimationFrame(() => {
      const nextEmpty = next.findIndex((d, i) => i > lastFilled && !d);
      const target = nextEmpty === -1 ? lastFilled : nextEmpty;
      inputsRef.current[target]?.focus();
      inputsRef.current[target]?.select();
    });
    if (next.every((d) => d !== '')) submit(next.join(''));
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      e.preventDefault();
      const next = [...digits];
      next[index - 1] = '';
      setDigits(next);
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      e.preventDefault();
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!pasted) return;
    const next = Array<string>(CODE_LENGTH).fill('');
    pasted.split('').forEach((c, i) => {
      next[i] = c;
    });
    setDigits(next);
    if (pasted.length === CODE_LENGTH) submit(pasted);
    else requestAnimationFrame(() => inputsRef.current[pasted.length]?.focus());
  }

  function handleResend() {
    if (cooldownSec > 0 || isResending) return;
    setResendFeedback(null);
    startResendTransition(async () => {
      const res = await onResend();
      if (res.ok) {
        setResendFeedback(t.resent);
        setCooldownSec(res.cooldownSec ?? 45);
        setDigits(Array(CODE_LENGTH).fill(''));
        setFeedback({ kind: 'idle' });
        submittingRef.current = false;
        inputsRef.current[0]?.focus();
      } else {
        if (res.retryAfterSec) setCooldownSec(res.retryAfterSec);
        setResendFeedback(res.error);
      }
    });
  }

  const isError = feedback.kind === 'error';
  const isSuccess = feedback.kind === 'success';
  const inputsDisabled = isPending || isSuccess;

  return (
    <div className="flex flex-col gap-4" aria-busy={isPending}>
      <p className="text-center font-sans text-sm leading-relaxed text-body">{t.sentTo(email)}</p>

      <div className="flex justify-center gap-2" aria-label={t.sentTo(email)}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              inputsRef.current[i] = el;
            }}
            value={d}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={CODE_LENGTH}
            disabled={inputsDisabled}
            aria-label={`${i + 1}`}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            onFocus={(e) => e.target.select()}
            className={`h-14 w-11 rounded-xl border-2 bg-white text-center font-sans text-[22px] font-bold outline-none transition-colors disabled:opacity-60 ${
              isError
                ? 'border-danger text-danger'
                : isSuccess
                  ? 'border-olive text-olive'
                  : d
                    ? 'border-olive text-ink'
                    : 'border-line-strong text-ink focus:border-olive'
            }`}
          />
        ))}
      </div>

      <div className="min-h-5 text-center" aria-live="polite">
        {feedback.kind === 'verifying' && <span className="font-sans text-[13px] text-muted">{t.verifying}</span>}
        {feedback.kind === 'error' && <span className="font-sans text-[13px] font-semibold text-danger">{feedback.message}</span>}
        {feedback.kind === 'success' && <span className="font-sans text-[13px] font-semibold text-olive">{t.success}</span>}
      </div>

      {!isSuccess && (
        <p className="text-center font-sans text-[13px] text-muted">
          {t.resendPrompt}{' '}
          {cooldownSec > 0 ? (
            <span className="text-faint">
              {t.resend} ({cooldownSec}s)
            </span>
          ) : (
            <Button variant="ghost" size="sm" onClick={handleResend} disabled={isResending}>
              {isResending ? t.resending : t.resend}
            </Button>
          )}
          {resendFeedback && <span className="mt-1 block text-faint">{resendFeedback}</span>}
        </p>
      )}
    </div>
  );
}
