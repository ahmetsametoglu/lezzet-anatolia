import { brand } from '@lezzet/brand';
import type { LocalizedCopy } from '@lezzet/i18n';
import { OTP_CODE_LENGTH, type AuthErrorKey } from '@lezzet/types';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Image, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { BackButton } from '@lezzet/mobile-kit/src/components/ui/back-button';
import { FormScroll } from '@lezzet/mobile-kit/src/components/ui/form-scroll';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { LoadingState } from '@lezzet/mobile-kit/src/components/ui/loading-state';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import { TextField } from '@lezzet/mobile-kit/src/components/ui/text-field';
import { DEV_ACCOUNTS, devSignIn } from '@lezzet/mobile-kit/src/lib/auth/dev-login';
import { authErrorText } from '@lezzet/mobile-kit/src/lib/auth/error-text';
import { signInWithGoogle } from '@lezzet/mobile-kit/src/lib/auth/oauth';
import { requestOtp, verifyOtp } from '@lezzet/mobile-kit/src/lib/auth/otp';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { fetchMe } from '@lezzet/mobile-kit/src/lib/api/me';
import { toastSuccess } from '@lezzet/mobile-kit/src/lib/toast/toast-store';
import { CustomerIcon } from '@lezzet/mobile-kit/src/components/customer/customer-icon';
import { customerMetrics } from '@lezzet/mobile-kit/src/components/customer/customer-metrics';
import { publishMe } from '@lezzet/mobile-kit/src/lib/me/use-me.hook';
import { SESSION_ENDED_NOTICE, type LoginNotice } from '@lezzet/mobile-kit/src/screens/login/login-notice';
import { CodeField } from './code-field';
import messages from '@lezzet/i18n/customer/login';

/*
  HIZLI DOĞRULAMA (v3 `vLogin`, v3:757-796) — şifresiz giriş: üç yol (Google · WhatsApp · e-posta),
  e-posta yolunda tek kullanımlık kod. GERÇEK AKIŞ (21.14c): kod isteği/doğrulaması telden
  (`lib/auth/otp`), Google sistem tarayıcısı + şema dönüşüyle (`lib/auth/oauth` — PKCE); başarıda
  oturum cihaza yazılır. Hata METNİ ekran sözlüğünden, TÜRÜ sözleşmeden (`AuthErrorKey`).
  Müşteri uygulamasının girişidir: operasyon uygulaması kendi ekranını taşıyor (21.312 — kayıtlı olmayan
  giremez, "hazır" ve "yetki yok" hâlleri). 15.09'da ortak çekirdekten (21.310) müşteri uygulamasına döndü
  (kullanıcı kararı): kitte yalnız iki uygulamanın ortak uyarı tanımı (`login-notice.ts`) kaldı.

  ── ŞABLONDAN SAPMALAR ──────────────────────────────────────────────────────
  1. **WhatsApp düğmesi BİLGİ VERİR** (web `login-client` ile aynı karar): sağlayıcı kurulmadı
     (modül 15); düğme tasarımdaki yerinde durur, basılınca "çok yakında" satırı çıkar — sahte
     oturum kurulamaz, sessiz düğme de olamaz.
  2. **"Demo: herhangi 6 rakam girin" satırı YAZILMADI** — prototipin kendine notu; üründe yer
     tutucu bir yalan olurdu.
  3. **Gömülü gizlilik bağlantısının dokunma hedefi satır yüksekliğidir** (v3 birebir, kullanıcı
     kararı 08.08 — daha önce ayrı satıra alınmıştı): erişilebilirlik payı bilinçli feda edildi,
     bağlantı ekranın en alt köşesinde ikincil bir yol.
*/

type Messages = LocalizedCopy<typeof messages>;

/** Ekranın durumu — şablonun `lg.mNull` / `emailShown` / `sent` / `busy` bayraklarının adı konmuş hâli. */
type LoginStage = 'choose' | 'email' | 'code' | 'verifying' | 'done';


/**
 * Metinsiz işaret logosu (`assets/images/logo-isaret.png`, 615×540 saydam): `design/uploads/lezzet-anatolie-logo-no-text.png`
 * karesinin ortası kırpıldı, krem zemini saydama çevrildi — 3x ekranda en büyük boyda (180) bile keskin. Boy ekran
 * yüksekliğinin %20'si, en çok 180 (web telefon girişi aynı kural, görünür yükseklikle); genişlik orandan türer. Karenin
 * 42'lik yatay logosu yerine — kullanıcı kararı 15.09. Kitin `loginLogoHeight`ı (52) tanıtım ve profil kurulumunun eski
 * logosunda kalır.
 */
const LOGO_ASPECT = 615 / 540;
const LOGO_MAX_HEIGHT = 180;
const LOGO_SCREEN_SHARE = 0.2;
const logoHeight = (screenHeight: number) => Math.min(LOGO_MAX_HEIGHT, screenHeight * LOGO_SCREEN_SHARE);

/** Karenin yol düğmesi (Musteri Mobil.dc.html:870 — 54; kitin `controlLg`si 52). Web telefon girişi de 54. */
const PROVIDER_HEIGHT = 54;

/** Kaba e-posta kontrolü: ekran KAPI DEĞİL, yalnız apaçık yanlışı erkenden söyler. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface LoginScreenProps {
  /** Doğrulama bitince çağrılır; varsayılanı geri dönmek (şablonun `finishLogin` davranışı). */
  onVerified?: () => void;
  /**
   * Açılışta söylenecek sebep — anahtar taşınır, metin taşınmaz. İki kaynağı var: OAuth dönüş
   * rotasının adlı reddi (`/auth/callback` → `?notice=`; Google akışı bu ekranın DIŞINDA düşer ve
   * cümlesi yine buradan kurulur) ve reddedilen oturum (21.304 — oturumu sunucu reddetti, ekranı
   * kökteki kanca açar).
   */
  initialNotice?: LoginNotice;
  /** Gizlilik metninin adresi (rota uygulamanın). Verilmezse cümle bağlantısız çizilir. */
  privacyHref?: Href;
}

export function LoginScreen({ onVerified, initialNotice, privacyHref }: LoginScreenProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  /* Geliştirme düğmeleri yalnız müşteri hesapları (21.312): personelinkiler operasyon uygulamasının girişinde. */
  const devButtons = DEV_ACCOUNTS.filter((account) => !account.operations);

  const [stage, setStage] = useState<LoginStage>('choose');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  /** Seçim aşamasının bilgi/hata satırı (WhatsApp "yakında", Google arızası, açılış sebebi). */
  const [notice, setNotice] = useState<string | null>(() => {
    if (initialNotice === undefined) return null;
    // Reddedilen oturumun cümlesi bu ekranın sözlüğünde; auth retleri ortak auth sözlüğünde.
    return initialNotice === SESSION_ENDED_NOTICE ? t.sessionEnded : authErrorText(locale, initialNotice);
  });
  /** İstek uçuştayken düğme kilidi — çift dokunuş iki kod isteği atmasın. */
  const [sending, setSending] = useState(false);
  /** 429'un bekleme süresi (sn) — sayaç sıfıra inene dek yeniden gönderme kilitli. */
  const [cooldownSec, setCooldownSec] = useState(0);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const timer = setTimeout(() => setCooldownSec((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldownSec]);

  /**
   * **Ekranı kapat — geri gidilecek yer YOKSA vitrine düş** (cihazda ölçüldü 12.08).
   *
   * ── ÖLÇÜLEN ARIZA ───────────────────────────────────────────────────────────
   * Bu ekran kendini `router.back()` ile kapatıyordu ve bu, "birisi beni ÜSTÜNE itti" varsayımıdır.
   * Onboarding'in yeni son adımı (12.08) giriş ekranına `replace` ile geliyor — yığında altında
   * hiçbir şey yok. Sonuç cihazda görüldü: dev girişi başarılı oldu, ekran *"Doğrulandı — hoş
   * geldiniz"* dedi ve ORADA ASILI KALDI; navigatör de `The action 'GO_BACK' was not handled by any
   * navigator` uyarısını bastı. Aynı ölü kapı geri okundaki `‹` düğmesinde de vardı.
   *
   * ── NEDEN ÇARE BURADA, ONBOARDING'DE DEĞİL ──────────────────────────────────
   * Onboarding'i `push`a çevirmek bu vakayı kapatırdı ama kuralı kapatmazdı: bir bildirimden ya da
   * derin bağlantıdan doğrudan `/login`e düşen her yol aynı duvara çarpar. "Kendimi kapat" cümlesi,
   * çağıranı olmadığında da bir anlam taşımalı — o anlam uygulamanın yaşadığı yerdir (vitrin).
   */
  const closeLogin = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  /**
   * **Geri adım adım** (kullanıcı bulgusu 15.09 — e-posta adımında ‹ ve Android'in geri tuşu girişi kapatıyordu, müşteri
   * seçime dönemiyordu): kod → e-posta (yazılan adres yerinde) → seçim; seçimde adım yok, ekran kapanır. Doğrulama
   * sürerken ve bittiğinde de adım yok. Web telefon girişi aynı. `true` = adım atıldı.
   */
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

  /* ANDROID'İN GERİ TUŞU ‹ ile aynı yolu izler (kitin çekmecesiyle aynı API — `bottom-sheet.tsx`): adım yoksa `false`
     döner ve gezgin ekranı kendisi kapatır. iOS'ta `BackHandler` sessiz. */
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', stepBack);
    return () => subscription.remove();
  }, [stepBack]);

  useEffect(() => {
    if (stage !== 'done') return;
    // v3'ün `finishLogin` toast'ı: kapanan ekranın ARKASINDA görünür (host kökte) — giriş
    // başarısının tek görsel onayı; sekme zaten girişli hâle dönmüş oluyor.
    toastSuccess(t.verifiedToast);
    if (onVerified !== undefined) {
      // Ekranı gömen host kendi akışını sürdürür; künye sorusu da onun yüzeyinin işidir.
      onVerified();
      return;
    }
    /* GİRİŞTE KÜNYE SORULMAZ (kullanıcı kararı 15.08) — buradan `/profile-setup`e bir yönlendirme
       vardı ve kaldırıldı. Kullanıcının cümlesi: *"kullanıcı adresini ve adını vermek istemeyebilir,
       giriş yaptığında. Bu da bizim için problem olmamalı."* Ad ve telefon artık ilk SİPARİŞTE,
       gerekçesi ekranda yazılı olarak isteniyor (ödeme ekranının iletişim bölümü). Kimliğini yeni
       kuran kişiyi bir forma sokmak, ona daha hiçbir şey vermeden bilgi istemekti.
       Profil BURADA okunup yayınlanır (`auth-callback`in ölçülmüş yarışının aynısı): `useMe`
       oturum olayını gecikmeli işliyor, dönülen ekran o aralıkta "misafir" sanabiliyor. */
    void fetchMe()
      .then((result) => {
        if (result.error !== null) return closeLogin();
        publishMe(result.data);
        closeLogin();
      })
      /* SESSİZ CATCH DEĞİL, AÇIK ÇARE (CLAUDE §1): okuma beklenmedik biçimde patlarsa müşteri
         doğrulanmış hâlde giriş ekranında ASILI kalırdı — künye sorusu yardımcı, giriş ise asıl
         iştir. Okunamayan profil "künyesi eksik" demek de değildir; ekran normal kapanır. */
      .catch(() => closeLogin());
  }, [stage, onVerified, closeLogin, t.verifiedToast]);

  /**
   * Bekleme cezası TEK kaynaktan söylenir: saniye sayacı yalnız DÜĞME etiketinde işler
   * (kullanıcı bulgusu 08.08 — saniyeyi hata metnine gömmek donmuş bir "bekleyin" yazısını
   * aktif düğmenin yanında bırakıyordu). Cezalı hâllerde hata satırı hiç açılmaz; kalanlarda
   * cümle sözlükten okunur.
   */
  const applyError = (
    result: { error: AuthErrorKey; retryAfterSec: number | null },
    setError: (text: string | null) => void,
  ) => {
    setCooldownSec(result.retryAfterSec ?? 0);
    const penalized = result.retryAfterSec !== null && (result.error === 'cooldown' || result.error === 'rate_limit');
    setError(penalized ? null : authErrorText(locale, result.error));
  };

  /* Dev test girişi — başarı OTP yolunun 'done' akışına biner (aynı toast, aynı kapanış). */
  const startDevSignIn = (email: string) => {
    setNotice(null);
    void devSignIn(email).then((result) => {
      // Dev yolunda HAM mesaj basılır (sebep `dev-login.ts` künyesinde): teşhis için.
      if (result.error !== null) {
        setNotice(result.error);
        return;
      }
      setStage('done');
    });
  };

  const startGoogle = () => {
    setNotice(null);
    /* Ekran 'verifying'e GEÇMEZ: başarı "tarayıcı açıldı" demektir ve akışın kalanı `/auth/
       callback` rotasında yaşar (dinleyici kurgusunun cihazda düşüşü — `oauth.ts` künyesi).
       Vazgeçip elle dönen müşteri ekranı bıraktığı gibi bulur; asılı bir bekleme yok. */
    void signInWithGoogle().then((result) => {
      if (result.error !== null) setNotice(authErrorText(locale, result.error));
    });
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

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <BackButton
          onPress={() => {
            if (!stepBack()) closeLogin();
          }}
          accessibilityLabel={t.back}
          testID="login-back"
        />
      </View>
      <FormScroll contentContainerStyle={styles.content} testID="login-scroll">
        {/* Metinsiz işaret logosu ortada; logo ile altındaki blok birlikte dikeyde ortalanır — boşluk üstte ve altta
            eşit (kullanıcı kararı 15.09; web telefon girişi aynı). Karenin yatay logosundan sapma. Varlık saydam PNG —
            beyaz zeminli eski jpg'nin `multiply` karışımı iOS'ta uygulanmıyordu (ölçüldü 08.08). */}
        <Image
          // Statik varlık Metro'da `require` ile yüklenir (Expo png için modül tipi bildirmiyor,
          // `import` derlenmez) — kural TS import disiplinine bakıyor, varlık yolunu bilmiyor.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          source={require('../../../assets/images/logo-isaret.png')}
          style={styles.logo}
          accessibilityLabel={brand.name}
        />
        <Text style={styles.title} accessibilityRole="header">
          {t.title}
        </Text>
        <Text style={styles.body}>{t.body}</Text>

        {/* Adımın alanı SABİT yükseklikte (`stepArea` — kullanıcı bulgusu 15.09): blok ortalandığı için e-posta ve kod
            adımlarının kısa alanı logoyu ve başlığı oynatıyordu. */}
        <View style={styles.stepArea}>
          {stage === 'choose' ? (
            <View style={styles.providers}>
              <PressableSurface onPress={startGoogle} feedback="scale" style={[styles.providerButton, styles.cardButton]} accessibilityLabel={t.google} testID="login-google">
                <Text style={styles.googleMark}>G</Text>
                <Text style={[styles.providerLabel, styles.cardLabel]}>{t.google}</Text>
              </PressableSurface>
              <PressableSurface
                onPress={() => setNotice(t.whatsappSoon)}
                feedback="scale"
                style={[styles.providerButton, styles.cardButton]}
                accessibilityLabel={t.whatsapp}
                testID="login-whatsapp"
              >
                <Icon name="whatsapp" size={theme.size.inlineIcon} color={theme.colors['brand-whatsapp-pure']} />
                <Text style={[styles.providerLabel, styles.cardLabel]}>{t.whatsapp}</Text>
              </PressableSurface>
              <PressableSurface
                onPress={() => {
                  setNotice(null);
                  setStage('email');
                }}
                feedback="scale"
                style={[styles.providerButton, styles.oliveButton]}
                accessibilityLabel={t.email}
                testID="login-email"
              >
                <CustomerIcon name="mail" size={theme.size.inlineIcon} color={theme.colors.card} />
                <Text style={[styles.providerLabel, styles.oliveLabel]}>{t.email}</Text>
              </PressableSurface>
              {notice === null ? null : (
                <Text style={styles.notice} testID="login-notice">
                  {notice}
                </Text>
              )}
            </View>
          ) : null}

          {stage === 'email' ? (
            <View style={styles.form}>
              <TextField
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  setEmailError(null);
                }}
                accessibilityLabel={t.emailField}
                placeholder={t.emailField}
                shape="pill"
                content="email"
                errorText={emailError ?? undefined}
                testID="login-email-input"
              />
              <PrimaryButton
                label={cooldownSec > 0 ? t.sendWait.replace('{s}', String(cooldownSec)) : sending ? t.sending : t.send}
                onPress={sendCode}
                disabled={sending || cooldownSec > 0}
                testID="login-send"
              />
            </View>
          ) : null}

          {stage === 'code' ? (
            <View style={styles.form}>
              <Text style={styles.sentLine}>{t.sent.replace('{email}', email.trim())}</Text>
              <CodeField
                value={code}
                onChangeText={onCodeChange}
                accessibilityLabel={t.codeField}
                placeholder={t.codePlaceholder}
                testID="login-code-input"
              />
              {codeError === null ? null : (
                <Text style={styles.codeError} testID="login-code-error">
                  {codeError}
                </Text>
              )}
              <View style={styles.resendRow}>
                {/* Bekleme süresince GERÇEKTEN kilitli (soluk + basılamaz) — sayaç yalnız burada. */}
                <TextAction
                  label={cooldownSec > 0 ? t.resendWait.replace('{s}', String(cooldownSec)) : t.resend}
                  onPress={resend}
                  disabled={sending || cooldownSec > 0}
                  testID="login-resend"
                />
              </View>
            </View>
          ) : null}

          {stage === 'verifying' || stage === 'done' ? (
            <View style={styles.busy}>
              <LoadingState
                size="md"
                label={stage === 'done' ? t.done : t.verifying}
                accessibilityLabel={stage === 'done' ? t.done : t.verifying}
                testID="login-busy"
              />
            </View>
          ) : null}
        </View>

        {/* Gizlilik bağlantısı CÜMLENİN İÇİNDE (v3 birebir — sapma 3'ün notu). */}
        <Text style={styles.legal}>
          {t.legalPrefix}
          {privacyHref === undefined ? (
            t.privacyInline
          ) : (
            <Text
              style={styles.legalLink}
              onPress={() => router.push(privacyHref)}
              accessibilityRole="link"
              testID="login-privacy"
            >
              {t.privacyInline}
            </Text>
          )}
          {t.legalSuffix}
        </Text>

        {/* GELİŞTİRME GİRİŞLERİ (kullanıcı isteği 09.08) — yalnız dev derlemesinde çizilir;
            OTP/Google turunu atlayan ama Supabase doğrulamasından geçen GERÇEK oturum
            (`lib/auth/dev-login` künyesi). Metin sabit Türkçe: müşteri bu satırı hiç görmez.
            Yalnız müşteri hesapları (21.312): personelin rol başına düğmeleri operasyon uygulamasının
            kendi girişinde. */}
        {__DEV__ ? (
          <View style={styles.devRow}>
            {devButtons.map((account) => (
              <TextAction
                key={account.email}
                label={account.label}
                onPress={() => startDevSignIn(account.email)}
                testID={`login-dev-${account.label.toLocaleLowerCase('tr')}`}
              />
            ))}
          </View>
        ) : null}
      </FormScroll>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
    paddingTop: rt.insets.top,
  },
  /* Dört düğme tek satıra sığmıyor: `wrap` + daha dar boşluk. Dar cihazda ikinci satıra iner,
     taşıp kesilmez (yalnız dev satırı — müşteri bunu hiç görmez). */
  devRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: theme.space['2xl'],
    paddingTop: theme.space['3xl'],
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.space['2xl'],
    paddingTop: theme.space.md,
  },
  /* `flexGrow` + ortalama: içerik kısa olsa da ekranı doldurur, logo ile blok birlikte dikeyde ortada durur (web
     `flex-1 justify-center`). Uzun içerikte (klavye, kısa ekran) ortalama etkisizleşir, kaydırma başlar. */
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.space['7xl'],
    paddingTop: theme.space['5xl'],
    paddingBottom: rt.insets.bottom + theme.space['8xl'],
    gap: theme.space['3xl'],
  },
  /* Genişlik orandan HESAPLANIR (onboarding'in cihaz kanıtı 09.08 — `aspectRatio` tek başına
     güvenilir çözülmüyor, resim ham boyuna düşebiliyor). Logonun altı başlığa bir boşluk daha açar (web `mb-4`). */
  logo: {
    height: logoHeight(rt.screen.height),
    width: logoHeight(rt.screen.height) * LOGO_ASPECT,
    alignSelf: 'center',
    marginBottom: theme.space['3xl'],
  },
  title: {
    fontFamily: theme.font.display[theme.text['page-title-sm--font-weight']],
    fontSize: theme.text['page-title-sm'],
    lineHeight: theme.text['page-title-sm'] * theme.text['h1-sm--line-height'],
    color: theme.colors.ink,
  },
  body: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.control,
    lineHeight: theme.text.control * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  /* Adımın alanı SABİT yükseklikte: seçimin üç yolu ve bilgi satırı kadar (üst pay + 3 yol + 2 aralık + satırın payı ve
     yüksekliği) — e-posta ve kod adımları daha kısa, ortalanmış blok onlarla kısalınca logo ve başlık oynuyordu
     (kullanıcı bulgusu 15.09). Web `min-h-53.75` aynı hesabı kendi token'ıyla yapar. */
  stepArea: {
    minHeight:
      theme.space.sm + 3 * PROVIDER_HEIGHT + 2 * theme.space.lg + theme.space.sm + theme.text.note * theme.text['lead--line-height'],
  },
  /* Karenin yol bloğunun üst payı (Musteri Mobil.dc.html:869 `margin-top:6px`; web `mt-1.5`). */
  providers: { gap: theme.space.lg, marginTop: theme.space.sm },
  providerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xl,
    height: PROVIDER_HEIGHT,
    paddingHorizontal: theme.space['5xl'],
    borderRadius: theme.radius.pill,
  },
  cardButton: {
    backgroundColor: theme.colors.card,
    borderWidth: theme.border.base,
    borderColor: theme.colors['sand-400'],
  },
  oliveButton: { backgroundColor: theme.colors.olive },
  providerLabel: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['body-sm'],
  },
  cardLabel: { color: theme.colors.ink },
  oliveLabel: { color: theme.colors.card },
  googleMark: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.step,
    color: theme.colors['brand-google'],
  },
  /** Seçim aşamasının bilgi satırı (WhatsApp "yakında" / Google arızası) — web'in `notice` muadili. Satır yüksekliği
      açık: `stepArea`nın ayırdığı yer bu satırın boyuyla hesaplanıyor. */
  notice: {
    fontFamily: theme.font.body[600],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors['olive-dark'],
    textAlign: 'center',
    marginTop: theme.space.sm,
  },
  form: { gap: theme.space.lg },
  sentLine: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.control,
    color: theme.colors.ink,
  },
  codeError: {
    fontFamily: theme.font.body[600],
    fontSize: theme.text.note,
    color: theme.colors['terracotta-bright'],
    textAlign: 'center',
  },
  resendRow: { alignItems: 'center' },
  busy: {
    alignItems: 'center',
    paddingVertical: theme.space['7xl'],
    // Halkanın ölçüsü kitten; blok yüksekliği tasarımın kendi nefesinden.
    minHeight: customerMetrics.codeFieldHeight,
  },
  legal: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    lineHeight: theme.text.micro * theme.text['lead--line-height'],
    color: theme.colors.muted,
    marginTop: theme.space.lg,
  },
  legalLink: {
    color: theme.colors.olive,
    textDecorationLine: 'underline',
  },
}));
