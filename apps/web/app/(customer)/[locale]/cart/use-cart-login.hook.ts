'use client';

import { useState } from 'react';
import { isValidEmail } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import type { OtpResendResult, OtpVerifyResult } from '@/components/customer/auth/otp-code-input';
import { useCart } from '@/components/customer/cart/cart-context';
import { useRouter } from '@/i18n/navigation';
import { authErrorMessage, type AuthErrorKey } from '@/lib/auth/errors';
import { sendEmailOtp, verifyEmailOtp } from '@/lib/auth/otp-actions';
import { createClient } from '@/lib/supabase/client';

/**
 * Sepetin içinden giriş (masaüstü kartı ve telefon çekmecesi): doğrulama yönlendirmez, sepet devralınır ve sayfa tazelenir ki müşteri
 * sepetinden ayrılmasın. `fallbackError` anahtarı olmayan hatanın ve açılamayan Google'ın cümlesidir.
 */
export function useCartLogin(locale: Locale, fallbackError: string) {
  const router = useRouter();
  const { reload } = useCart();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = email.trim();
  const validEmail = isValidEmail(trimmed);

  /** Anahtar → cümle: `authErrorMessage` saf tablo, çeviri ekranda yapılır. */
  const say = (key: AuthErrorKey | null): string => (key ? authErrorMessage(key, locale) : fallbackError);

  const google = async () => {
    setError(null);
    const supabase = createClient();
    const next = `${window.location.pathname}${window.location.search}`;
    const { error: failure } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Dönüşte müşteri sepete döner, giriş sayfasına savrulmaz.
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        // Paylaşılan cihazda hesap seçtirilir: bir öncekinin oturumu sessizce devralınmasın.
        queryParams: { prompt: 'select_account' },
      },
    });
    if (failure) setError(fallbackError);
  };

  const send = async () => {
    if (!validEmail || busy) return;
    setBusy(true);
    setError(null);
    const { data, errorKey } = await sendEmailOtp(trimmed);
    setBusy(false);
    if (!data) return setError(say(errorKey));
    setSent(true);
  };

  /** Yönlendirme adresi kullanılmaz: müşteri sepette kalır, sayfa tazelenince blok hesaba döner. */
  const verify = async (code: string): Promise<OtpVerifyResult> => {
    const { data, errorKey } = await verifyEmailOtp(trimmed, code);
    return data ? { ok: true } : { ok: false, error: say(errorKey) };
  };

  const resend = async (): Promise<OtpResendResult> => {
    const { data, errorKey } = await sendEmailOtp(trimmed);
    return data ? { ok: true } : { ok: false, error: say(errorKey) };
  };

  const verified = () => {
    // Sıra önemli: önce sepet (misafir listesi sunucuya devralınır), sonra sunucu kareleri.
    reload();
    router.refresh();
  };

  return { email, setEmail, trimmed, validEmail, sent, setSent, busy, error, google, send, verify, resend, verified };
}
