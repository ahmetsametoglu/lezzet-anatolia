import type { LocalizedCopy } from '@lezzet/i18n';
import { OTP_CODE_LENGTH, type AuthErrorKey } from '@lezzet/types';
import { useCallback, useEffect, useState } from 'react';

import { fetchMe } from '@lezzet/mobile-kit/src/lib/api/me';
import { devSignIn } from '@lezzet/mobile-kit/src/lib/auth/dev-login';
import { authErrorText } from '@lezzet/mobile-kit/src/lib/auth/error-text';
import { signInWithGoogle } from '@lezzet/mobile-kit/src/lib/auth/oauth';
import { requestOtp, verifyOtp } from '@lezzet/mobile-kit/src/lib/auth/otp';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { publishMe } from '@lezzet/mobile-kit/src/lib/me/use-me.hook';
import { toastSuccess } from '@lezzet/mobile-kit/src/lib/toast/toast-store';
import { SESSION_ENDED_NOTICE, type LoginNotice } from '@lezzet/mobile-kit/src/screens/login/login-notice';
import messages from '@lezzet/i18n/customer/login';

type Messages = LocalizedCopy<typeof messages>;

export type LoginStage = 'choose' | 'email' | 'code' | 'verifying' | 'done';

/** Kaba kontrol: yalnız apaçık yanlışı erkenden söyler, asıl doğrulama sunucuda. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface LoginFlowOptions {
  /** Açılışta söylenecek sebep (anahtar): OAuth dönüşünün reddi ya da sunucunun reddettiği oturum. */
  initialNotice?: LoginNotice;
  /** Google dönüşünün açacağı rota (`/auth/callback` izinli hedefleri tanır); verilmezse dönüş rotasının kendi evi. */
  googleReturn?: string;
  /** Doğrulama bitince çağrılır ve profil okumasını atlar: girişi gömen yer kendi akışını sürdürür. */
  onVerified?: () => void;
  /** Doğrulanan profil yayınlanınca girişi kapatır (ekran ya da çekmece). */
  onClose: () => void;
}

/** Giriş ekranı ile sepetin giriş çekmecesinin ortak akışı: seçim → e-posta → kod, bekleme sayacı ve hata satırları. */
export function useLoginFlow({ initialNotice, googleReturn, onVerified, onClose }: LoginFlowOptions) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];

  const [stage, setStage] = useState<LoginStage>('choose');
  const [email, setEmailValue] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  /** Seçim adımının bilgi ya da hata satırı; `undefined` açılış sebebinin hâlâ gösterildiği demek. */
  const [notice, setNotice] = useState<string | null | undefined>(undefined);
  /* Açılış sebebi metin olarak saklanmaz, her çizimde güncel dilden kurulur: reddedilen oturum kapanırken hesabın dili düşer ve
     saklanan metin ekranın geri kalanından farklı dilde kalırdı. Oturumun cümlesi bu ekranın sözlüğünde, auth retleri ortak sözlükte. */
  const shownNotice =
    notice !== undefined
      ? notice
      : initialNotice === undefined
        ? null
        : initialNotice === SESSION_ENDED_NOTICE
          ? t.sessionEnded
          : authErrorText(locale, initialNotice);
  /** İstek uçuştayken düğme kilidi — çift dokunuş iki kod isteği atmasın. */
  const [sending, setSending] = useState(false);
  /** 429'un bekleme süresi (sn) — sayaç sıfıra inene dek yeniden gönderme kilitli. */
  const [cooldownSec, setCooldownSec] = useState(0);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const timer = setTimeout(() => setCooldownSec((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldownSec]);

  /** Geri adım adım: kod → e-posta → seçim. `false`: adım yok, giriş kapanmalı. */
  const stepBack = useCallback(() => {
    if (stage === 'code') {
      setStage('email');
      setCode('');
      setCodeError(null);
      return true;
    }
    if (stage === 'email') {
      setStage('choose');
      setEmailError(null);
      return true;
    }
    return false;
  }, [stage]);

  useEffect(() => {
    if (stage !== 'done') return;
    // Toast kökte yaşar, kapanan girişin arkasında görünür: girişin tek görsel onayı.
    toastSuccess(t.verifiedToast);
    if (onVerified !== undefined) {
      onVerified();
      return;
    }
    /* Girişte künye sorulmaz, ad ve telefon ilk siparişte istenir. Profil burada okunup yayınlanır: `useMe` oturum
       olayını geç işlediği için dönülen ekran kendini misafir sanabiliyor. */
    void fetchMe()
      .then((result) => {
        if (result.error !== null) return onClose();
        publishMe(result.data);
        onClose();
      })
      /* Okuma patlasa da giriş kapanır: doğrulanmış müşteri girişte asılı kalmasın. */
      .catch(() => onClose());
  }, [stage, onVerified, onClose, t.verifiedToast]);

  /**
   * Bekleme cezasının saniyesi yalnız düğme etiketinde sayar; cezalı hâlde ayrı hata satırı açılmaz, yoksa donmuş bir
   * "bekleyin" yazısı kalırdı.
   */
  const applyError = (result: { error: AuthErrorKey; retryAfterSec: number | null }, setError: (text: string | null) => void) => {
    setCooldownSec(result.retryAfterSec ?? 0);
    const penalized = result.retryAfterSec !== null && (result.error === 'cooldown' || result.error === 'rate_limit');
    setError(penalized ? null : authErrorText(locale, result.error));
  };

  /* Dev test girişi — başarı OTP yolunun 'done' akışına biner (aynı toast, aynı kapanış). */
  const startDevSignIn = (devEmail: string) => {
    setNotice(null);
    void devSignIn(devEmail).then((result) => {
      // Dev yolunda ham mesaj basılır: teşhis için.
      if (result.error !== null) {
        setNotice(result.error);
        return;
      }
      setStage('done');
    });
  };

  const startGoogle = () => {
    setNotice(null);
    /* Başarı yalnız "tarayıcı açıldı" demek; akışın kalanı `/auth/callback` rotasında. Vazgeçen müşteri girişi
       bıraktığı gibi bulur. */
    void signInWithGoogle(googleReturn).then((result) => {
      if (result.error !== null) setNotice(authErrorText(locale, result.error));
    });
  };

  const chooseEmail = () => {
    setNotice(null);
    setStage('email');
  };

  const setEmail = (value: string) => {
    setEmailValue(value);
    setEmailError(null);
  };

  const sendCode = () => {
    if (!EMAIL_PATTERN.test(email.trim())) {
      setEmailError(t.emailInvalid);
      return;
    }
    setEmailError(null);
    setSending(true);
    void requestOtp(email.trim(), locale).then((result) => {
      setSending(false);
      if (result.error !== null) {
        applyError({ error: result.error, retryAfterSec: result.retryAfterSec }, setEmailError);
        return;
      }
      setCode('');
      setCodeError(null);
      setStage('code');
    });
  };

  const resend = () => {
    if (cooldownSec > 0 || sending) return;
    setSending(true);
    setCode('');
    setCodeError(null);
    void requestOtp(email.trim(), locale).then((result) => {
      setSending(false);
      if (result.error !== null) {
        applyError({ error: result.error, retryAfterSec: result.retryAfterSec }, setCodeError);
      }
    });
  };

  const onCodeChange = (value: string) => {
    // Yalnız rakam ve en çok altı hane: alan biçimi kendi zorlar, kullanıcı hata mesajı görmez.
    const digits = value.replace(/\D/g, '').slice(0, OTP_CODE_LENGTH);
    setCode(digits);
    setCodeError(null);
    if (digits.length !== OTP_CODE_LENGTH) return;

    setStage('verifying');
    void verifyOtp(email.trim(), digits, locale).then((result) => {
      if (result.error !== null) {
        // Kod aşamasına geri: yanlış kod alan temizlenmiş hâlde yeniden denenir.
        setStage('code');
        setCode('');
        applyError({ error: result.error, retryAfterSec: result.retryAfterSec }, setCodeError);
        return;
      }
      setStage('done');
    });
  };

  return {
    stage,
    email,
    setEmail,
    emailError,
    code,
    codeError,
    notice: shownNotice,
    sending,
    cooldownSec,
    stepBack,
    startDevSignIn,
    startGoogle,
    chooseEmail,
    sendCode,
    resend,
    onCodeChange,
  };
}

export type LoginFlow = ReturnType<typeof useLoginFlow>;
