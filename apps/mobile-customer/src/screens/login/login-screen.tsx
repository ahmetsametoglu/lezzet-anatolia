import { brand } from '@lezzet/brand';
import type { LocalizedCopy } from '@lezzet/i18n';
import { useNavigation, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { BackHandler, Image, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { BackButton } from '@lezzet/mobile-kit/src/components/ui/back-button';
import { FormScroll } from '@lezzet/mobile-kit/src/components/ui/form-scroll';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import { DEV_ACCOUNTS } from '@lezzet/mobile-kit/src/lib/auth/dev-login';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import type { LoginNotice } from '@lezzet/mobile-kit/src/screens/login/login-notice';
import { LoginLegal, LoginSteps } from './login-steps';
import { useLoginFlow } from './use-login-flow.hook';
import messages from '@lezzet/i18n/customer/login';

// Tasarımın kod adımındaki "Demo" satırı prototipin notu olduğu için yazılmadı.
type Messages = LocalizedCopy<typeof messages>;

/** Varlığın oranı (615×540). Boy ekran yüksekliğinin %20'si, en çok 180: kısa ekranda yollar görünür kalsın. */
const LOGO_ASPECT = 615 / 540;
const LOGO_MAX_HEIGHT = 180;
const LOGO_SCREEN_SHARE = 0.2;
const logoHeight = (screenHeight: number) => Math.min(LOGO_MAX_HEIGHT, screenHeight * LOGO_SCREEN_SHARE);

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
  const router = useRouter();
  /* Personelin geliştirme girişleri operasyon uygulamasında. */
  const devButtons = DEV_ACCOUNTS.filter((account) => !account.operations);

  /** Yığında geri gidilecek ekran yoksa (onboarding `replace` ile, derin bağlantı) vitrine döner; yoksa ekran asılı kalır. */
  const closeLogin = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const flow = useLoginFlow({ initialNotice, onVerified, onClose: closeLogin });
  const { stepBack, stage } = flow;

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

        <LoginSteps flow={flow} />
        <LoginLegal privacyHref={privacyHref} />

        {/* Geliştirme girişleri yalnız dev derlemesinde: OTP'yi atlayan ama Supabase doğrulamasından geçen gerçek oturum. */}
        {__DEV__ ? (
          <View style={styles.devRow}>
            {devButtons.map((account) => (
              <TextAction
                key={account.email}
                label={account.label}
                onPress={() => flow.startDevSignIn(account.email)}
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
}));
