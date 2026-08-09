import type { LocalizedCopy } from '@lezzet/i18n';
import type { AuthErrorKey } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { BackButton } from '@/components/ui/back-button';
import { Icon } from '@/components/ui/icon';
import { LoadingState } from '@/components/ui/loading-state';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { TextAction } from '@/components/ui/text-action';
import { TextField } from '@/components/ui/text-field';
import { signInWithGoogle } from '@/lib/auth/oauth';
import { requestOtp, verifyOtp } from '@/lib/auth/otp';
import { deviceLocale } from '@/lib/i18n/locale';
import { CustomerIcon } from '@/screens/customer-kit/customer-icon';
import { customerMetrics } from '@/screens/customer-kit/customer-metrics';
import { CodeField } from './code-field';
import messages from './messages.json';

/*
  HIZLI DOĞRULAMA (v3 `vLogin`, v3:757-796) — şifresiz giriş: üç yol (Google · WhatsApp · e-posta),
  e-posta yolunda tek kullanımlık kod. GERÇEK AKIŞ (21.14c): kod isteği/doğrulaması telden
  (`lib/auth/otp`), Google sistem tarayıcısı + şema dönüşüyle (`lib/auth/oauth` — PKCE); başarıda
  oturum cihaza yazılır. Hata METNİ ekran sözlüğünden, TÜRÜ sözleşmeden (`AuthErrorKey`).

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

/** Kod uzunluğu tasarımdan (altı hane). */
const CODE_LENGTH = 6;

/** Logonun kaynak oranı (1244×602) — yükseklik şablondan (52), genişlik orandan türer. */
const LOGO_ASPECT = 1244 / 602;

/** Kaba e-posta kontrolü: ekran KAPI DEĞİL, yalnız apaçık yanlışı erkenden söyler. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface LoginScreenProps {
  /** Doğrulama bitince çağrılır; varsayılanı geri dönmek (şablonun `finishLogin` davranışı). */
  onVerified?: () => void;
}

export function LoginScreen({ onVerified }: LoginScreenProps) {
  const locale = deviceLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();

  const [stage, setStage] = useState<LoginStage>('choose');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  /** Seçim aşamasının bilgi/hata satırı (WhatsApp "yakında", Google arızası). */
  const [notice, setNotice] = useState<string | null>(null);
  /** İstek uçuştayken düğme kilidi — çift dokunuş iki kod isteği atmasın. */
  const [sending, setSending] = useState(false);
  /** 429'un bekleme süresi (sn) — sayaç sıfıra inene dek yeniden gönderme kilitli. */
  const [cooldownSec, setCooldownSec] = useState(0);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const timer = setTimeout(() => setCooldownSec((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldownSec]);

  useEffect(() => {
    if (stage !== 'done') return;
    const finish = onVerified ?? (() => router.back());
    finish();
  }, [stage, onVerified, router]);

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
    setError(penalized ? null : t.errors[result.error]);
  };

  const startGoogle = () => {
    setNotice(null);
    setStage('verifying');
    void signInWithGoogle().then((result) => {
      if (result.error !== null) {
        setStage('choose');
        setNotice(t.errors[result.error]);
        return;
      }
      setStage('done');
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
    const digits = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    setCodeError(null);
    if (digits.length !== CODE_LENGTH) return;

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
        <BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="login-back" />
      </View>
      <ScrollView contentContainerStyle={styles.content} testID="login-scroll">
        {/* Logo yükseklikten ölçülür (şablon: 52). Varlık ŞEFFAF PNG: kaynak jpg beyaz zeminliydi
            ve şablonun `multiply` karışımı iOS'ta uygulanmadı (ölçüldü 08.08 — beyaz kutu görünüyordu);
            beyaz→alfa dönüşümü türetim script'iyle yapıldı, karışıma gerek kalmadı. */}
        <Image
          source={require('../../../assets/images/logo.png')}
          style={styles.logo}
          accessibilityLabel={t.brand}
        />
        <Text style={styles.title} accessibilityRole="header">
          {t.title}
        </Text>
        <Text style={styles.body}>{t.body}</Text>

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

        {/* Gizlilik bağlantısı CÜMLENİN İÇİNDE (v3 birebir — sapma 3'ün notu). */}
        <Text style={styles.legal}>
          {t.legalPrefix}
          <Text
            style={styles.legalLink}
            onPress={() => router.push({ pathname: '/legal/[page]', params: { page: 'privacy' } })}
            accessibilityRole="link"
            testID="login-privacy"
          >
            {t.privacyInline}
          </Text>
          {t.legalSuffix}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
    paddingTop: rt.insets.top,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.space['2xl'],
    paddingTop: theme.space.md,
  },
  content: {
    paddingHorizontal: theme.space['7xl'],
    paddingTop: theme.space['5xl'],
    paddingBottom: rt.insets.bottom + theme.space['8xl'],
    gap: theme.space['3xl'],
  },
  logo: {
    height: customerMetrics.loginLogoHeight,
    aspectRatio: LOGO_ASPECT,
    alignSelf: 'flex-start',
  },
  title: {
    fontFamily: theme.font.display[theme.text['page-title-sm--font-weight']],
    fontSize: theme.text['page-title-sm'],
    fontWeight: theme.text['page-title-sm--font-weight'],
    lineHeight: theme.text['page-title-sm'] * theme.text['h1-sm--line-height'],
    color: theme.colors.ink,
  },
  body: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.control,
    lineHeight: theme.text.control * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  providers: { gap: theme.space.lg },
  providerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xl,
    height: theme.size.controlLg,
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
    fontWeight: theme.text['button--font-weight'],
  },
  cardLabel: { color: theme.colors.ink },
  oliveLabel: { color: theme.colors.card },
  googleMark: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.step,
    fontWeight: theme.text['button--font-weight'],
    color: theme.colors['brand-google'],
  },
  /** Seçim aşamasının bilgi satırı (WhatsApp "yakında" / Google arızası) — web'in `notice` muadili. */
  notice: {
    fontFamily: theme.font.body[600],
    fontSize: theme.text.note,
    fontWeight: '600',
    color: theme.colors['olive-dark'],
    textAlign: 'center',
    marginTop: theme.space.sm,
  },
  form: { gap: theme.space.lg },
  sentLine: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.control,
    fontWeight: theme.text['field-label--font-weight'],
    color: theme.colors.ink,
  },
  codeError: {
    fontFamily: theme.font.body[600],
    fontSize: theme.text.note,
    fontWeight: '600',
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
