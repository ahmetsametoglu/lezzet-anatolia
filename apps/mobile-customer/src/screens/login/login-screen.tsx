import { brand } from '@lezzet/brand';
import type { LocalizedCopy } from '@lezzet/i18n';
import { OTP_CODE_LENGTH, type AuthErrorKey } from '@lezzet/types';
import { useNavigation, useRouter, type Href } from 'expo-router';
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
import { customerMetrics } from '@lezzet/mobile-kit/src/components/customer/customer-metrics';
import { publishMe } from '@lezzet/mobile-kit/src/lib/me/use-me.hook';
import { SESSION_ENDED_NOTICE, type LoginNotice } from '@lezzet/mobile-kit/src/screens/login/login-notice';
import { CodeField } from './code-field';
import messages from '@lezzet/i18n/customer/login';

/*
  WhatsApp sağlayıcısı kurulu değil: düğme yerinde durur ve "yakında" der, sahte oturum kurulmaz. Tasarımın "Demo"
  satırı prototipin notu olduğu için yazılmadı.
*/

type Messages = LocalizedCopy<typeof messages>;

type LoginStage = 'choose' | 'email' | 'code' | 'verifying' | 'done';

/** Varlığın oranı (615×540). Boy ekran yüksekliğinin %20'si, en çok 180: kısa ekranda yollar görünür kalsın. */
const LOGO_ASPECT = 615 / 540;
const LOGO_MAX_HEIGHT = 180;
const LOGO_SCREEN_SHARE = 0.2;
const logoHeight = (screenHeight: number) => Math.min(LOGO_MAX_HEIGHT, screenHeight * LOGO_SCREEN_SHARE);

/** Tasarımın yol düğmesi 54; kitin `controlLg`si 52 olduğu için ayrı sabit. */
const PROVIDER_HEIGHT = 54;

/** Kaba kontrol: yalnız apaçık yanlışı erkenden söyler, asıl doğrulama sunucuda. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface LoginScreenProps {
  /** Doğrulama bitince çağrılır; verilmezse ekran kapanır. */
  onVerified?: () => void;
  /** Açılışta söylenecek sebep (anahtar): OAuth dönüşünün reddi ya da sunucunun reddettiği oturum. */
  initialNotice?: LoginNotice;
  /** Gizlilik metninin adresi; verilmezse cümle bağlantısız çizilir. */
  privacyHref?: Href;
}

export function LoginScreen({ onVerified, initialNotice, privacyHref }: LoginScreenProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  /* Personelin geliştirme girişleri operasyon uygulamasında. */
  const devButtons = DEV_ACCOUNTS.filter((account) => !account.operations);

  const [stage, setStage] = useState<LoginStage>('choose');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  /** Seçim adımının bilgi ya da hata satırı. */
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

  /** Yığında geri gidilecek ekran yoksa (onboarding `replace` ile, derin bağlantı) vitrine döner; yoksa ekran asılı kalır. */
  const closeLogin = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  /** Geri adım adım: kod → e-posta → seçim. `false`: adım yok, ekran kapanmalı. */
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

  /* Android'in geri tuşu ‹ ile aynı yolu izler; adım yoksa gezgin ekranı kapatır. */
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', stepBack);
    return () => subscription.remove();
  }, [stepBack]);

  /* iOS'un kenardan kaydırması BackHandler'a uğramadan yığını geri alır; adımda kapalı ki girişi kapatmasın. */
  const navigation = useNavigation();
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: stage === 'choose' });
  }, [navigation, stage]);

  useEffect(() => {
    if (stage !== 'done') return;
    // Toast kökte yaşar, kapanan ekranın arkasında görünür: girişin tek görsel onayı.
    toastSuccess(t.verifiedToast);
    if (onVerified !== undefined) {
      // Ekranı gömen yer kendi akışını sürdürür.
      onVerified();
      return;
    }
    /* Girişte künye sorulmaz, ad ve telefon ilk siparişte istenir. Profil burada okunup yayınlanır: `useMe` oturum
       olayını geç işlediği için dönülen ekran kendini misafir sanabiliyor. */
    void fetchMe()
      .then((result) => {
        if (result.error !== null) return closeLogin();
        publishMe(result.data);
        closeLogin();
      })
      /* Okuma patlasa da ekran kapanır: doğrulanmış müşteri girişte asılı kalmasın. */
      .catch(() => closeLogin());
  }, [stage, onVerified, closeLogin, t.verifiedToast]);

  /**
   * Bekleme cezasının saniyesi yalnız düğme etiketinde sayar; cezalı hâlde ayrı hata satırı açılmaz, yoksa donmuş bir
   * "bekleyin" yazısı kalırdı.
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
    /* Başarı yalnız "tarayıcı açıldı" demek; akışın kalanı `/auth/callback` rotasında. Vazgeçen müşteri ekranı
       bıraktığı gibi bulur. */
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
        <Image
          // Statik varlık Metro'da `require` ile yüklenir: Expo png için modül tipi bildirmiyor, `import` derlenmez.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          source={require('../../../assets/images/logo-isaret.png')}
          style={styles.logo}
          accessibilityLabel={brand.name}
        />
        <Text style={styles.title} accessibilityRole="header">
          {t.title}
        </Text>
        <Text style={styles.body}>{t.body}</Text>

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
                <Icon name="mail" size={theme.size.inlineIcon} color={theme.colors.card} />
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
                {/* Sayaç yalnız burada; bekleme süresince eylem kilitli. */}
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

        {/* Geliştirme girişleri yalnız dev derlemesinde: OTP'yi atlayan ama Supabase doğrulamasından geçen gerçek oturum. */}
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
  /* Düğmeler dar cihazda ikinci satıra iner. */
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
  /* Kısa içerik ekranı doldurur ve blok dikeyde ortalanır; uzun içerikte kaydırma başlar. */
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.space['7xl'],
    paddingTop: theme.space['5xl'],
    paddingBottom: rt.insets.bottom + theme.space['8xl'],
    gap: theme.space['3xl'],
  },
  /* Genişlik orandan hesaplanır: `aspectRatio` tek başına resmi ham boyuna düşürebiliyor. */
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
  /* Seçimin üç yolu ve bilgi satırı kadar sabit yer: kısa adımlarda ortalanmış blok oynamasın. */
  stepArea: {
    minHeight:
      theme.space.sm + 3 * PROVIDER_HEIGHT + 2 * theme.space.lg + theme.space.sm + theme.text.note * theme.text['lead--line-height'],
  },
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
  /** Satır yüksekliği açık: `stepArea` bu satırın boyuyla hesaplanıyor. */
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
