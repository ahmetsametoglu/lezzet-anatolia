import type { LocalizedCopy } from '@lezzet/i18n';
import type { AuthErrorKey } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { BackButton } from '@/components/ui/back-button';
import { FormScroll } from '@/components/ui/form-scroll';
import { Icon } from '@/components/ui/icon';
import { LoadingState } from '@/components/ui/loading-state';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { TextAction } from '@/components/ui/text-action';
import { TextField } from '@/components/ui/text-field';
import { DEV_ACCOUNTS, devSignIn } from '@/lib/auth/dev-login';
import { authErrorText } from '@/lib/auth/error-text';
import { signInWithGoogle } from '@/lib/auth/oauth';
import { requestOtp, verifyOtp } from '@/lib/auth/otp';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { fetchMe } from '@/lib/api/me';
import { publishToast } from '@/lib/toast/toast-store';
import { CustomerIcon } from '@/screens/customer-kit/customer-icon';
import { customerMetrics } from '@/screens/customer-kit/customer-metrics';
import { publishMe } from '@/screens/customer-kit/use-me.hook';
import { hasProfileGap } from '@/screens/profile-setup/profile-gaps';
import { profileSetupRoute } from '@/screens/profile-setup/use-profile-setup-gate.hook';
import { CodeField } from './code-field';
import { operationsHomeRoute } from './post-login-route';
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
  /**
   * OAuth dönüş rotasının bıraktığı adlı ret (`/auth/callback` → `?notice=`): Google akışı bu
   * ekranın DIŞINDA düşer ve cümlesi yine bu ekranın sözlüğünden kurulur — anahtar taşınır,
   * metin taşınmaz.
   */
  initialNotice?: AuthErrorKey;
}

export function LoginScreen({ onVerified, initialNotice }: LoginScreenProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();

  const [stage, setStage] = useState<LoginStage>('choose');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  /** Seçim aşamasının bilgi/hata satırı (WhatsApp "yakında", Google arızası). */
  const [notice, setNotice] = useState<string | null>(
    initialNotice === undefined ? null : authErrorText(locale, initialNotice),
  );
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
    // v3'ün `finishLogin` toast'ı: kapanan ekranın ARKASINDA görünür (host kökte) — giriş
    // başarısının tek görsel onayı; sekme zaten girişli hâle dönmüş oluyor.
    publishToast(t.verifiedToast);
    if (onVerified !== undefined) {
      // Ekranı gömen host kendi akışını sürdürür; künye sorusu da onun yüzeyinin işidir.
      onVerified();
      return;
    }
    /* KÜNYE SORUSUNUN İLK ANI (kullanıcı kararı 10.08) — kimlik ŞU AN kuruldu; ad ve telefon
       eksikse müşteri geldiği ekrana değil, tamamlama akışına gider. Açılışta sormak yerine
       burada sormanın gerekçesi kapının künyesinde.
       Profil BURADA okunup yayınlanır (`auth-callback`in ölçülmüş yarışının aynısı): `useMe`
       oturum olayını gecikmeli işliyor, dönülen ekran o aralıkta "misafir" sanabiliyor. */
    void fetchMe()
      .then((result) => {
        if (result.error !== null) return router.back();
        publishMe(result.data);
        /* PERSONEL MÜŞTERİ SEKMESİNE DÖNMEZ (21.32): rolü olan kişi doğrudan operasyon kabuğuna
           gider — webin tek `/connexion` modelinin karşılığı. Künye sorusundan ÖNCE: ad/telefon
           sipariş yolunun ön şartıdır ve personel o yoldan geçmez (kapının künyesi). */
        const operationsRoute = operationsHomeRoute(result.data);
        if (operationsRoute !== null) return router.replace(operationsRoute);
        if (hasProfileGap(result.data)) return router.replace(profileSetupRoute());
        router.back();
      })
      /* SESSİZ CATCH DEĞİL, AÇIK ÇARE (CLAUDE §1): okuma beklenmedik biçimde patlarsa müşteri
         doğrulanmış hâlde giriş ekranında ASILI kalırdı — künye sorusu yardımcı, giriş ise asıl
         iştir. Okunamayan profil "künyesi eksik" demek de değildir; ekran normal kapanır. */
      .catch(() => router.back());
  }, [stage, onVerified, router, t.verifiedToast]);

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
      <FormScroll contentContainerStyle={styles.content} testID="login-scroll">
        {/* Logo yükseklikten ölçülür (şablon: 52). Varlık ŞEFFAF PNG: kaynak jpg beyaz zeminliydi
            ve şablonun `multiply` karışımı iOS'ta uygulanmadı (ölçüldü 08.08 — beyaz kutu görünüyordu);
            beyaz→alfa dönüşümü türetim script'iyle yapıldı, karışıma gerek kalmadı. */}
        <Image
          // Statik varlık Metro'da `require` ile yüklenir (Expo png için modül tipi bildirmiyor,
          // `import` derlenmez) — kural TS import disiplinine bakıyor, varlık yolunu bilmiyor.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
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

        {/* GELİŞTİRME GİRİŞLERİ (kullanıcı isteği 09.08) — yalnız dev derlemesinde çizilir;
            OTP/Google turunu atlayan ama Supabase doğrulamasından geçen GERÇEK oturum
            (`lib/auth/dev-login` künyesi). Metin sabit Türkçe: müşteri bu satırı hiç görmez.
            ROL BAŞINA BİR DÜĞME (21.32): rol → bölüm eşlemesi birebir olduğu için tek düğme
            bölümlerin yalnız birini açardı; hangi hesabın hangi rolü taşıdığı listede. */}
        {__DEV__ ? (
          <View style={styles.devRow}>
            {DEV_ACCOUNTS.map((account) => (
              <TextAction
                key={account.email}
                label={account.label}
                onPress={() => startDevSignIn(account.email)}
                tone={account.operations ? 'terracotta' : undefined}
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
  content: {
    paddingHorizontal: theme.space['7xl'],
    paddingTop: theme.space['5xl'],
    paddingBottom: rt.insets.bottom + theme.space['8xl'],
    gap: theme.space['3xl'],
  },
  /* Genişlik orandan HESAPLANIR (onboarding'in cihaz kanıtı 09.08 — `aspectRatio` tek başına
     güvenilir çözülmüyor, resim ham boyuna düşebiliyor). Aynı varlık, aynı ölçü, tek kaynak. */
  logo: {
    height: customerMetrics.loginLogoHeight,
    width: customerMetrics.loginLogoHeight * LOGO_ASPECT,
    alignSelf: 'flex-start',
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
  },
  cardLabel: { color: theme.colors.ink },
  oliveLabel: { color: theme.colors.card },
  googleMark: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.step,
    color: theme.colors['brand-google'],
  },
  /** Seçim aşamasının bilgi satırı (WhatsApp "yakında" / Google arızası) — web'in `notice` muadili. */
  notice: {
    fontFamily: theme.font.body[600],
    fontSize: theme.text.note,
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
