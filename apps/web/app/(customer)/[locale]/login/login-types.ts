import type { FormEventHandler } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { OtpResendResult, OtpVerifyResult } from '@/components/customer/auth/otp-code-input';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir) — bu yüzden `import type` değil.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

// Sayfa, mantık ve iki sunum bu tipleri paylaşır; ayrı yaprak dosya, aralarında döngüsel import doğmasın diye.

/** Arayüz metinleri messages.json'dan TÜRETİLİR (elle interface yok). */
export type Messages = LocalizedCopy<typeof messages>;

/** Auth hata metinleri (lib/auth/errors.ts kaynaklı, seçili dilde). */
export type LoginErrors = { invalidEmail: string; googleUnavailable: string };

export type Stage = { kind: 'email' } | { kind: 'code'; email: string };

/**
 * Masaüstü ve mobil sunum varyantlarının paylaştığı sözleşme — tüm state + handler'lar
 * login-client'ta üretilir, yalnız DÜZEN varyanta göre değişir (Sapma 3: çatallanma client sınırında).
 */
export interface LoginViewProps {
  t: Messages;
  errors: LoginErrors;
  subtitle: string;
  locale: Locale;
  stage: Stage;
  error: string | null;
  notice: string | null;
  isSending: boolean;
  emailInvalid: boolean;
  emailRef: UseFormRegisterReturn['ref'];
  emailField: Omit<UseFormRegisterReturn, 'ref'>;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onBack: () => void;
  onGoogle: () => void;
  onWhatsApp: () => void;
  onVerify: (code: string) => Promise<OtpVerifyResult>;
  onResend: () => Promise<OtpResendResult>;
}
