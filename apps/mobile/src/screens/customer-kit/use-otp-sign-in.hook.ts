import { useCallback, useEffect, useState } from 'react';
import { isValidEmail } from '@lezzet/helper';
import type { AuthErrorKey } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { fetchMe } from '@/lib/api/me';
import { authErrorText } from '@/lib/auth/error-text';
import { requestOtp, verifyOtp } from '@/lib/auth/otp';
import { publishMe } from './use-me.hook';

/*
  AKIŞ İÇİ KİMLİK ADIMI — e-posta → altı haneli kod → oturum. Bir akışın ORTASINDA hesap açan
  ekranların ortak mekaniği.

  ── NEDEN BURADA (21.31) ────────────────────────────────────────────────────
  İkinci tüketen doğdu. Birincisi bölge talebi çekmecesiydi (10.08, `place-notice-sheet`), ikincisi
  B2B başvuru formu: ikisinde de müşteri bir işi bitirmeye gelmiş, kimliği o işin İÇİNDE kuruluyor.
  Aynı durum makinesini ikinci kez yazmak (faz + geri sayım + iki ayrı hata alanı + yarış koruması)
  bir gün ayrışacak bir kopya olurdu — CLAUDE §1.

  ── METİN BURADA DEĞİL, EKRANDA ─────────────────────────────────────────────
  Yalnız MANTIK paylaşılıyor. Cümleler her ekranın kendi `messages.json`ında kalır (CLAUDE §2:
  "global JSON yok; her sayfa kendi sözlüğü") ve zaten farklı olmaları gerekir — bölge talebinde
  "haberi nereye gönderelim", başvuruda "başvuruyu kimin adına yazalım". Hook'un ürettiği tek metin
  auth sözleşmesinin ANAHTARLARININ karşılığıdır ve o da ortak sözlükten (`lib/auth/error-text`) —
  aynı hâl iki yüzeyde iki farklı şey söylemesin.

  ── BEKLEME CEZASI TEK KAYNAKTAN ────────────────────────────────────────────
  429'un saniyesi yalnız DÜĞME/BAĞLANTI etiketinde işler (giriş ekranının 08.08'de ölçülmüş
  kararı): saniyeyi hata metnine gömmek, donmuş bir "bekleyin" yazısını aktif düğmenin yanında
  bırakıyordu. Bu yüzden cezalı retlerde hata metni YAZILMAZ, yalnız sayaç kurulur.
*/

/** Kod uzunluğu — giriş ekranıyla aynı (altı hane). Dışa AÇILMADI: alanı bu modül doğruluyor. */
const OTP_CODE_LENGTH = 6;

/** `verifying` ayrı bir faz: alan ve düğme kilitli kalmalı, iki kez doğrulanan kod iki tur açardı. */
type OtpSignInPhase = 'email' | 'code' | 'verifying';

interface UseOtpSignInInput {
  locale: Locale;
  /** "Geçerli bir e-posta yazın" — biçim reddi ekranın cümlesi, auth sözleşmesinin anahtarı değil. */
  invalidEmailText: string;
  /** Oturum kuruldu — asıl işi (talep kaydı, başvuru yazımı) ÇAĞIRAN yapar; hook iş bilmez. */
  onSignedIn: () => void;
}

interface UseOtpSignInResult {
  phase: OtpSignInPhase;
  email: string;
  setEmail: (value: string) => void;
  emailError: string | null;
  code: string;
  codeError: string | null;
  /** İstek uçuşta — çift dokunuş iki kod isteği atmasın. */
  sending: boolean;
  /** 429'un bekleme süresi (sn); sıfıra inene dek gönderme kilitli. */
  cooldownSec: number;
  sendCode: () => void;
  resend: () => void;
  onCodeChange: (value: string) => void;
  /** Çekmece kapanıp yeniden açıldığında akış baştan başlar. */
  reset: () => void;
}

export function useOtpSignIn({ locale, invalidEmailText, onSignedIn }: UseOtpSignInInput): UseOtpSignInResult {
  const [phase, setPhase] = useState<OtpSignInPhase>('email');
  const [email, setEmailValue] = useState('');
  /* Alan hataları FAZDAN AYRI tutulur: geçersiz adres akışın hâlini değiştirmez (hâlâ "adres
     soruyoruz"), yalnız alanın altına bir satır ekler. */
  const [emailError, setEmailError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [cooldownSec, setCooldownSec] = useState(0);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const timer = setTimeout(() => setCooldownSec((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldownSec]);

  const applyAuthError = useCallback(
    (result: { error: AuthErrorKey; retryAfterSec: number | null }, setError: (text: string | null) => void) => {
      setCooldownSec(result.retryAfterSec ?? 0);
      const penalized = result.retryAfterSec !== null && (result.error === 'cooldown' || result.error === 'rate_limit');
      setError(penalized ? null : authErrorText(locale, result.error));
    },
    [locale],
  );

  const setEmail = useCallback((value: string) => {
    setEmailValue(value);
    setEmailError(null);
  }, []);

  const sendCode = useCallback(() => {
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setEmailError(invalidEmailText);
      return;
    }
    setEmailError(null);
    setSending(true);
    void requestOtp(trimmed, locale).then((result) => {
      setSending(false);
      if (result.error !== null) {
        applyAuthError({ error: result.error, retryAfterSec: result.retryAfterSec }, setEmailError);
        return;
      }
      setCode('');
      setCodeError(null);
      setPhase('code');
    });
  }, [applyAuthError, email, invalidEmailText, locale]);

  const resend = useCallback(() => {
    if (cooldownSec > 0 || sending) return;
    setSending(true);
    setCode('');
    setCodeError(null);
    void requestOtp(email.trim(), locale).then((result) => {
      setSending(false);
      if (result.error !== null) {
        applyAuthError({ error: result.error, retryAfterSec: result.retryAfterSec }, setCodeError);
      }
    });
  }, [applyAuthError, cooldownSec, email, locale, sending]);

  const onCodeChange = useCallback(
    (value: string) => {
      // Yalnız rakam ve en çok altı hane: alan biçimi kendi zorlar, kullanıcı hata mesajı görmez.
      const digits = value.replace(/\D/g, '').slice(0, OTP_CODE_LENGTH);
      setCode(digits);
      setCodeError(null);
      if (digits.length !== OTP_CODE_LENGTH) return;

      setPhase('verifying');
      void verifyOtp(email.trim(), digits, locale).then((result) => {
        if (result.error !== null) {
          // Kod aşamasına geri: yanlış kod, alan temizlenmiş hâlde yeniden denenir.
          setPhase('code');
          setCode('');
          applyAuthError({ error: result.error, retryAfterSec: result.retryAfterSec }, setCodeError);
          return;
        }
        /* PROFİL BURADA OKUNUP YAYINLANIR (giriş ekranının 09.08'de ÖLÇÜLMÜŞ yarışı): `useMe`
           oturum olayını gecikmeli işliyor, arkadaki ekranlar o aralıkta müşteriyi "misafir"
           sanabiliyor. Okuma düşerse akış DURMAZ — asıl iş çağıranın işi, selamlama yardımcı. */
        void fetchMe().then((me) => {
          if (me.error === null) publishMe(me.data);
        });
        onSignedIn();
      });
    },
    [applyAuthError, email, locale, onSignedIn],
  );

  const reset = useCallback(() => {
    setPhase('email');
    setCode('');
    setCodeError(null);
    setEmailError(null);
  }, []);

  return {
    phase,
    email,
    setEmail,
    emailError,
    code,
    codeError,
    sending,
    cooldownSec,
    sendCode,
    resend,
    onCodeChange,
    reset,
  };
}
