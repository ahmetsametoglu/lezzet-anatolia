import type { LocalizedCopy } from '@lezzet/i18n';
import { useRouter } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { BackButton } from '@/components/ui/back-button';
import { Icon } from '@/components/ui/icon';
import { LoadingState } from '@/components/ui/loading-state';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { TextAction } from '@/components/ui/text-action';
import { TextField } from '@/components/ui/text-field';
import { deviceLocale } from '@/lib/i18n/locale';
import { CustomerIcon } from '@/screens/customer-kit/customer-icon';
import { customerMetrics } from '@/screens/customer-kit/customer-metrics';
import messages from './messages.json';

/*
  HIZLI DOĞRULAMA (v3 `vLogin`) — şifresiz giriş: üç yol (Google · WhatsApp · e-posta) ve e-posta
  yolunda tek kullanımlık kod.

  ── UI-ONLY, GERÇEK OTP'YE BAĞLI DEĞİL (21.14'ün açık hükmü) ────────────────
  `lib/auth/otp.ts` ve oturum deposu ZATEN VAR (21.4/21.9) ama bu ekran onlara BİLEREK
  bağlanmadı: bu etap ekranların tasarıma birebir geçirilmesi, uç bağlama sonraki etap. Ekran
  kendi durum makinesini yürütüyor; bağlanma günü değişecek olan üç çağrıdır (`sendOtp`,
  `verifyOtp`, oturum yazımı), yerleşim ve metinler aynı kalır.

  ── ŞABLONDAN SAPMALAR ──────────────────────────────────────────────────────
  1. **Logo yerine YAZIM.** Şablon `assets/logo.jpg` gösteriyor; o varlık uygulama deposunda YOK
     ve varlık eklemek bu görevin yazı alanı dışında. Marka adı Lora ile yazıldı; logo varlığı
     ihtiyacı raporlandı.
  2. **"Demo: herhangi 6 rakam girin" satırı YAZILMADI.** O cümle prototipin kendine notudur;
     üründe yer tutucu bir yalan olurdu. Yerine alanın kendi yardımcı satırı: kaç rakam beklendiği
     ve otomatik doğrulandığı.
  3. **Google/WhatsApp düğmeleri BUGÜN e-posta yoluna DÜŞMEZ, doğrudan doğrular** — şablonun
     kendi davranışı (`gLogin` → `finishLogin`). Gerçek sağlayıcılar bağlanana kadar üç yol da
     aynı sonucu verir; düğmeleri engelli göstermek "yakında" demek olurdu, oysa akış tasarımda
     tam olarak bu.
  4. **Gizlilik bağlantısı** cümlenin içinde değil ALTINDA ayrı bir metin eylemi: RN'de metin
     içine gömülü basılabilir parça ekran okuyucuda cümleyi ikiye böler ve dokunma hedefi
     satır yüksekliği kadar (≈16 dp) kalırdı.
*/

type Messages = LocalizedCopy<typeof messages>;

/** Ekranın durumu — şablonun `login.m` / `sent` / `busy` üçlüsünün adı konmuş hâli. */
type LoginStage = 'choose' | 'email' | 'code' | 'verifying' | 'done';

/** Kod uzunluğu tasarımdan (altı hane). */
const CODE_LENGTH = 6;

/** Doğrulama gecikmesi (ms) — gerçek ucun yerini tutan bekleme; tek yerde ve parametrik. */
const VERIFY_DELAY_MS = 900;

/** Kaba e-posta kontrolü: ekran KAPI DEĞİL, yalnız apaçık yanlışı erkenden söyler. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface LoginScreenProps {
  /** Doğrulama bitince çağrılır; varsayılanı geri dönmek (şablonun `finishLogin` davranışı). */
  onVerified?: () => void;
}

export function LoginScreen({ onVerified }: LoginScreenProps) {
  const t: Messages = messages[deviceLocale()];
  const { theme } = useUnistyles();
  const router = useRouter();

  const [stage, setStage] = useState<LoginStage>('choose');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [code, setCode] = useState('');

  /* Doğrulama bekleyişi tek yerde: hangi yoldan gelindiği (sağlayıcı ya da kod) fark etmiyor. */
  useEffect(() => {
    if (stage !== 'verifying') return;
    const timer = setTimeout(() => setStage('done'), VERIFY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    if (stage !== 'done') return;
    const finish = onVerified ?? (() => router.back());
    finish();
  }, [stage, onVerified, router]);

  const sendCode = () => {
    if (!EMAIL_PATTERN.test(email.trim())) {
      setEmailError(t.emailInvalid);
      return;
    }
    setEmailError(null);
    setStage('code');
  };

  const onCodeChange = (value: string) => {
    // Yalnız rakam ve en çok altı hane: alan biçimi kendi zorlar, kullanıcı hata mesajı görmez.
    const digits = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) setStage('verifying');
  };

  const providerButton = (
    label: string,
    icon: ReactNode,
    testID: string,
    tone: 'card' | 'olive',
    onPress: () => void,
  ) => (
    <PressableSurface
      onPress={onPress}
      feedback="scale"
      style={[styles.providerButton, tone === 'olive' ? styles.oliveButton : styles.cardButton]}
      accessibilityLabel={label}
      testID={testID}
    >
      {icon}
      <Text style={[styles.providerLabel, tone === 'olive' ? styles.oliveLabel : styles.cardLabel]}>{label}</Text>
    </PressableSurface>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="login-back" />
      </View>
      <ScrollView contentContainerStyle={styles.content} testID="login-scroll">
        <Text style={styles.brand}>{t.brand}</Text>
        <Text style={styles.title} accessibilityRole="header">
          {t.title}
        </Text>
        <Text style={styles.body}>{t.body}</Text>

        {stage === 'choose' ? (
          <View style={styles.providers}>
            {providerButton(t.google, <Text style={styles.googleMark}>G</Text>, 'login-google', 'card', () =>
              setStage('verifying'),
            )}
            {providerButton(
              t.whatsapp,
              <Icon name="whatsapp" size={theme.size.inlineIcon} color={theme.colors['brand-whatsapp-pure']} />,
              'login-whatsapp',
              'card',
              () => setStage('verifying'),
            )}
            {/* E-posta yolu TEK farklı olan: kod akışına girer, doğrudan doğrulamaz. */}
            {providerButton(
              t.email,
              <CustomerIcon name="mail" size={theme.size.inlineIcon} color={theme.colors.card} />,
              'login-email',
              'olive',
              () => setStage('email'),
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
              errorText={emailError ?? undefined}
              testID="login-email-input"
            />
            <PrimaryButton label={t.send} onPress={sendCode} testID="login-send" />
          </View>
        ) : null}

        {stage === 'code' ? (
          <View style={styles.form}>
            <Text style={styles.sentLine}>{t.sent.replace('{email}', email.trim())}</Text>
            <TextField
              value={code}
              onChangeText={onCodeChange}
              accessibilityLabel={t.codeField}
              placeholder={t.codePlaceholder}
              helperText={t.codeHint}
              numeric
              testID="login-code-input"
            />
            <View style={styles.resendRow}>
              <TextAction label={t.resend} onPress={() => setCode('')} testID="login-resend" />
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

        <Text style={styles.legal}>{t.legal}</Text>
        <TextAction label={t.privacy} onPress={() => router.push({ pathname: '/legal/[page]', params: { page: 'privacy' } })} testID="login-privacy" />
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
  brand: {
    fontFamily: theme.font.display[theme.text['h2-sm--font-weight']],
    fontSize: theme.text['h2-sm'],
    fontWeight: theme.text['h2-sm--font-weight'],
    color: theme.colors.terracotta,
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
  form: { gap: theme.space.lg },
  sentLine: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.control,
    fontWeight: theme.text['field-label--font-weight'],
    color: theme.colors.ink,
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
    color: theme.colors['sand-600'],
    marginTop: theme.space.lg,
  },
}));
