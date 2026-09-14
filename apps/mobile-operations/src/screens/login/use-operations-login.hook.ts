import { isValidEmail } from '@lezzet/helper';
import { OTP_CODE_LENGTH } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard } from 'react-native';

import { failureCauseOf } from '@lezzet/mobile-kit/src/lib/api/client';
import { fetchMe } from '@lezzet/mobile-kit/src/lib/api/me';
import { devSignIn } from '@lezzet/mobile-kit/src/lib/auth/dev-login';
import { exchangeOAuthCode, signInWithGoogle } from '@lezzet/mobile-kit/src/lib/auth/oauth';
import { NOT_REGISTERED, requestOtp, verifyOtp } from '@lezzet/mobile-kit/src/lib/auth/otp';
import { endDeviceSession } from '@lezzet/mobile-kit/src/lib/auth/session-end';
import { signOut } from '@lezzet/mobile-kit/src/lib/auth/sign-out';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import type { LoginNotice } from '@lezzet/mobile-kit/src/screens/login/login-notice';
import { checkOAuthAccount } from '@/lib/api/oauth-check';
import { operationsSectionsOf } from '@/lib/operations/sections';
import { operationsSectionRoute } from '@/screens/login/post-login-route';

import { loginErrorText, type LoginErrorKey } from './copy';
import { onOAuthCode, takeOAuthCode } from './oauth-handoff';
import { useLeaveLoginOnSignIn } from './use-leave-login-on-sign-in.hook';

/*
  OPERASYON GİRİŞİNİN DURUM MAKİNESİ (21.312 — tasarım 14.09: `design/02-operasyon/Operasyon Mobil - Giris.dc.html`).

  İKİ HÂL, TEK EKRAN: giriş (e-posta adımı → altı haneli kod adımı · Google) ve "yetki yok". Sistemde kayıtlı olmayan
  giremez (kullanıcı kararı 14.09): kod isteği ve doğrulama `registeredOnly` taşır, Google dönüşü kayıt kapısına
  sorulur (`checkOAuthAccount`) ve ret uyarı kutusunda söylenir. Kayıtlı ama rolsüz hesap "yetki yok"a düşer ve
  oturumu cihazda BIRAKILMAZ — bu uygulamada bir işe yaramaz. "Yetki talebi gönder" düğmesi YOK.

  DOĞRUDAN GİRİŞ (kullanıcı kararı 14.09 — tasarımın "hazır" hâli çizilmedi): doğrulanan personel hemen ilk bölümüne
  girer. Hesap, rol ve kapsam kabuğun başlığında ve hesap menüsünde zaten görünüyor; ara ekran her girişe bir dokunuş
  ekliyordu. Kararı kapının kuralları verir — rol → bölüm `operationsSectionsOf`, adres `operationsSectionRoute`;
  ikinci bir "personel mi" hesabı yazılmadı. Hesap okunamazsa (ağ · 5xx) kapıya gidilir: "okunamadı + tekrar dene"
  orada (CLAUDE §1 — bilinmeyen, "yetki yok" değildir).

  BEKLEME SAYACI YALNIZ 429'DA: tasarımın 24 sn'lik sayacı demo değeri; sunucunun bekleme süresi 60 sn ve istemciye
  yalnız ret cevabında söyleniyor (`Retry-After`). Sayaç o an kurulur — ekranda yalnız olgu.
*/

type LoginStage = 'entry' | 'no_role';

/** Örtünün cümlesi hangi işin sürdüğünü söyler (tasarım: "Kod gönderiliyor" · "Doğrulanıyor" · "Google…"). */
type LoginBusy = 'sending' | 'verifying' | 'google';

interface LoginFailure {
  error: LoginErrorKey;
  retryAfterSec: number | null;
  offline: boolean;
}

export function useOperationsLogin(initialNotice: LoginNotice | undefined) {
  const locale = useAppLocale();
  const router = useRouter();

  const [stage, setStage] = useState<LoginStage>('entry');
  const [email, setEmail] = useState('');
  /** E-posta alanının altındaki uyarı kutusu — biçim, istek reddi, Google reddi, açılış sebebi. */
  const [warning, setWarning] = useState<string | null>(() => (initialNotice === undefined ? null : loginErrorText(initialNotice)));
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  /** 429'un bekleme süresi (sn) — sıfıra inene dek yeniden gönderme bağı kilitli. */
  const [cooldownSec, setCooldownSec] = useState(0);
  const [busy, setBusy] = useState<LoginBusy | null>(null);
  /** Son istek ağa hiç çıkamadı — tasarımın "Bağlantı yok" bandı; sonraki denemede kalkar. */
  const [offline, setOffline] = useState(false);
  const [noRoleEmail, setNoRoleEmail] = useState<string | null>(null);
  /** "E-postayı değiştir" sayacı — adres alanı her dönüşte odakla yeniden kurulur (ilk açılışta klavye açılmaz). */
  const [addressRound, setAddressRound] = useState(0);

  /* KENDİ AKIŞI: kod doğrulaması ve Google dönüşü oturumu BU ekranda açar ve yönlendirmeyi kendisi yapar. Girişten
     çıkma dinleyicisi yalnız dışarıdan açılan oturum içindir (dev düğmesi, otomatik giriş). */
  const ownFlow = useRef(false);
  useLeaveLoginOnSignIn(ownFlow);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const timer = setTimeout(() => setCooldownSec((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldownSec]);

  /**
   * Uyarı kutusu ADRES adımındadır: kod paneli açıkken gelen uyarı (Google, dev düğmesi) paneli kapatır — kod adımı
   * adresin yerine açılıyor (kullanıcı kararı 14.09) ve uyarı gizli adımda söylenirdi.
   */
  const warn = useCallback((text: string) => {
    setCodeOpen(false);
    setCode('');
    setWarning(text);
  }, []);

  /**
   * Reddin sözü. Bekleme cezası (429) cümle değil SAYAÇTIR: kod paneli açıksa geri sayım yeniden gönderme bağında
   * işler ve ayrı satır açılmaz (kitin tek-kaynak kuralı, `login-screen.tsx`); panel kapalıyken sayaç görünmez,
   * cümle kutuda söylenir. Ağ yoksa cümle yok, bant var.
   */
  const showFailure = (failure: LoginFailure, inPanel: boolean) => {
    if (failure.offline) {
      setOffline(true);
      return;
    }
    setCooldownSec(failure.retryAfterSec ?? 0);
    if (!inPanel) {
      warn(loginErrorText(failure.error));
      return;
    }
    const penalized = failure.retryAfterSec !== null && (failure.error === 'rate_limit' || failure.error === 'cooldown');
    setCodeError(penalized ? null : loginErrorText(failure.error));
  };

  const changeEmail = (value: string) => {
    setEmail(value);
    setWarning(null);
    setCodeOpen(false);
    setCode('');
    setCodeError(null);
  };

  /** Kod bölümünden adrese dönüş (kullanıcı kararı 14.09): panel kapanır, adres korunur ve alan odağı alır. */
  const changeAddress = () => {
    setCodeOpen(false);
    setCode('');
    setCodeError(null);
    setWarning(null);
    setAddressRound((round) => round + 1);
  };

  /** İlk gönderim ve yeniden gönderim aynı yol — düğme adres adımında, bağ kod panelinde. */
  const requestCode = () => {
    const address = email.trim();
    if (busy !== null || address === '') return;
    if (!isValidEmail(address)) {
      setWarning(loginErrorText('invalid_email'));
      return;
    }
    setWarning(null);
    setCodeError(null);
    setOffline(false);
    setBusy('sending');
    void requestOtp(address, locale, { registeredOnly: true }).then((result) => {
      setBusy(null);
      setCode('');
      if (result.error === null) {
        setCodeOpen(true);
        return;
      }
      // Kayıt kapısının reddi açık bir paneli de kapatır: bu adrese kod gitmiyor.
      if (result.error === NOT_REGISTERED) setCodeOpen(false);
      showFailure(result, codeOpen && result.error !== NOT_REGISTERED);
    });
  };

  /**
   * Oturum açıldı — hesabın hâli KAPININ kaynağından okunur. Personel doğrudan ilk bölümüne girer; rolsüz hesabın
   * oturumu kapanır ve "yetki yok" söylenir.
   */
  const openAccount = useCallback(async () => {
    const me = await fetchMe();
    if (me.error !== null) {
      setBusy(null);
      router.replace('/');
      return;
    }
    const [landingSection] = operationsSectionsOf(me.data.roles);
    if (landingSection === undefined) {
      await signOut();
      ownFlow.current = false;
      setNoRoleEmail(me.data.email);
      setBusy(null);
      setStage('no_role');
      return;
    }
    // Örtü yönlendirme bitene dek kalır: ekran kalkıyor, formun bir kare geri görünmesi titreme olurdu.
    router.replace(operationsSectionRoute(landingSection));
  }, [router]);

  const changeCode = (value: string) => {
    // Yalnız rakam ve en çok altı hane: alan biçimi kendi zorlar, kişi hata mesajı görmez.
    const digits = value.replace(/\D/g, '').slice(0, OTP_CODE_LENGTH);
    setCode(digits);
    setCodeError(null);
    if (digits.length !== OTP_CODE_LENGTH || busy !== null) return;
    /* Kod tamam — klavye kapanır: alanı taşıyan adım birazdan ekrandan kalkıyor ve açık kalan klavye sonraki ekranın
       yarısını örtüyordu (cihazda görüldü 14.09). */
    Keyboard.dismiss();
    ownFlow.current = true;
    setOffline(false);
    setBusy('verifying');
    void verifyOtp(email.trim(), digits, locale, { registeredOnly: true }).then((result) => {
      if (result.error === null) return openAccount();
      ownFlow.current = false;
      setBusy(null);
      setCode('');
      // Doğrulama da kayıt kapısına sorar: hesap istekle doğrulama arasında silindiyse panel kapanır.
      if (result.error === NOT_REGISTERED) setCodeOpen(false);
      showFailure(result, result.error !== NOT_REGISTERED);
    });
  };

  /** Google dönüşü — değişim, kayıt kapısı, hesap. Kod dönüş rotasının devriyle gelir (`oauth-handoff.ts`). */
  const completeGoogle = useCallback(
    async (oauthCode: string | null) => {
      setWarning(null);
      setOffline(false);
      if (oauthCode === null) {
        warn(loginErrorText('oauth_failed'));
        return;
      }
      ownFlow.current = true;
      setBusy('google');
      const exchanged = await exchangeOAuthCode(oauthCode);
      if (exchanged.error !== null) {
        ownFlow.current = false;
        setBusy(null);
        warn(loginErrorText(exchanged.error));
        return;
      }
      const check = await checkOAuthAccount();
      if (check.error !== null) {
        /* Kapı "hayır" dediyse hesap sunucuda SİLİNDİ; soramadıysak da içeri alınmaz. İki hâlde de yerel oturum
           yetkili çağrı YAPMADAN kapanır (`endDeviceSession`, `signOut` değil): silinmiş kimlikle atılan istek 401
           alır, "oturumun sona erdi" kapanışını tetikler ve ekran yanlış sebebi söylerdi. */
        await endDeviceSession();
        ownFlow.current = false;
        setBusy(null);
        if (failureCauseOf(check) === 'connection') setOffline(true);
        else warn(loginErrorText(check.error === NOT_REGISTERED ? NOT_REGISTERED : 'oauth_failed'));
        return;
      }
      await openAccount();
    },
    [openAccount, warn],
  );

  /* Devir iki yoldan gelir: ekran altta açıkken dinleyiciden, soğuk açılışta montajda. */
  useEffect(() => {
    const take = () => {
      const handoff = takeOAuthCode();
      if (handoff !== null) void completeGoogle(handoff.code);
    };
    take();
    return onOAuthCode(take);
  }, [completeGoogle]);

  const startGoogle = () => {
    if (busy !== null) return;
    setWarning(null);
    setOffline(false);
    /* Tarayıcı AÇILIR, bekleme kurulmaz: devamı dönüş rotasının devriyle gelir. Vazgeçip dönen kişi ekranı
       bıraktığı gibi bulur (kitin künyesi, `lib/auth/oauth.ts`). */
    void signInWithGoogle().then((result) => {
      if (result.error !== null) warn(loginErrorText(result.error));
    });
  };

  /**
   * Geliştirme düğmeleri (yalnız `__DEV__`): oturum DIŞARIDAN açılmış sayılır ve kapıya gidilir — Maestro akışları
   * bölümü bekliyor (`maestro/common/dev-login.yaml`). Ret HAM mesajla söylenir (teşhis — `dev-login.ts` künyesi).
   */
  const startDevSignIn = (devEmail: string) => {
    setWarning(null);
    void devSignIn(devEmail).then((result) => {
      if (result.error !== null) warn(result.error);
    });
  };

  /** "Yetki yok"tan girişe — oturum zaten kapandı (`openAccount`); form baştan açılır. */
  const backToEntry = () => {
    ownFlow.current = false;
    setStage('entry');
    setNoRoleEmail(null);
    setEmail('');
    setCode('');
    setCodeOpen(false);
    setCodeError(null);
    setWarning(null);
  };

  return {
    stage,
    email,
    changeEmail,
    warning,
    codeOpen,
    code,
    changeCode,
    codeError,
    cooldownSec,
    busy,
    offline,
    noRoleEmail,
    requestCode,
    startGoogle,
    startDevSignIn,
    backToEntry,
    addressRound,
    changeAddress,
  };
}

export type OperationsLogin = ReturnType<typeof useOperationsLogin>;
