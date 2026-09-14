import { brand } from '@lezzet/brand';
import { Image, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { FormScroll } from '@lezzet/mobile-kit/src/components/ui/form-scroll';
import type { LoginNotice } from '@lezzet/mobile-kit/src/screens/login/login-notice';
import { emToDp } from '@lezzet/mobile-kit/src/theme/parse';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { NoRoleNotice } from '@/components/operations/no-role-notice';

import { BusyOverlay } from './components/busy-overlay';
import { EntryForm } from './components/entry-form';
import { OfflineBanner } from './components/offline-banner';
import { loginCopy } from './copy';
import { LOGO_ASPECT, LOGO_HEIGHT } from './login-metrics';
import { useOperationsLogin } from './use-operations-login.hook';

/*
  OPERASYON GİRİŞİ (21.312 — tasarım 14.09: `design/02-operasyon/Operasyon Mobil - Giris.dc.html`).
  Krem zemin, ortalanmış tek sütun: işaret + "OPERASYON", altında hâlin kendisi (giriş · yetki yok). Doğrulanan
  personel doğrudan bölümüne girer — tasarımın "hazır" hâli çizilmedi (kullanıcı kararı 14.09).
  Durum makinesi `use-operations-login.hook.ts`te; bu dosya yalnız dizer. Bağlantı bandı kaydırmanın dışında,
  en üstte; iş sürerken örtü ekranın tamamını kaplar.
*/

interface OperationsLoginScreenProps {
  /** Açılış sebebi (`/login?notice=`) — reddedilen oturum (21.304). */
  initialNotice?: LoginNotice;
}

export function OperationsLoginScreen({ initialNotice }: OperationsLoginScreenProps) {
  const login = useOperationsLogin(initialNotice);
  return (
    <View style={styles.screen}>
      {login.offline ? <OfflineBanner /> : null}
      <FormScroll contentContainerStyle={styles.content} testID="login-scroll">
        <View style={styles.brand}>
          <Image
            // Statik varlık Metro'da `require` ile yüklenir (kitin giriş ekranının künyesi).
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            source={require('../../../assets/images/logo-isaret.png')}
            style={styles.logo}
            accessibilityLabel={brand.name}
          />
          <Text style={styles.eyebrow}>{loginCopy.eyebrow}</Text>
        </View>
        {login.stage === 'entry' ? <EntryForm login={login} /> : null}
        {login.stage === 'no_role' ? (
          <NoRoleNotice email={login.noRoleEmail} onSwitchAccount={login.backToEntry} testID="login-no-role" />
        ) : null}
      </FormScroll>
      {login.busy === null ? null : <BusyOverlay label={loginCopy.busy[login.busy]} />}
    </View>
  );
}

const styles = StyleSheet.create((_theme, rt) => ({
  screen: {
    flex: 1,
    paddingTop: rt.insets.top,
    backgroundColor: operationsTheme.colors.cream,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: operationsTheme.space['4xl'],
    paddingHorizontal: operationsTheme.space['7xl'],
    paddingTop: operationsTheme.space['5xl'],
    paddingBottom: rt.insets.bottom + operationsTheme.space['5xl'],
  },
  brand: {
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    paddingTop: operationsTheme.space['2xl'],
    paddingBottom: operationsTheme.space.lg,
  },
  logo: {
    height: LOGO_HEIGHT,
    width: LOGO_HEIGHT * LOGO_ASPECT,
  },
  eyebrow: {
    fontFamily: operationsTheme.font.body[800],
    fontSize: operationsTheme.text['eyebrow-xs'],
    letterSpacing: emToDp(operationsTheme.text['eyebrow-xs--letter-spacing'], operationsTheme.text['eyebrow-xs']),
    color: operationsTheme.colors.muted,
  },
}));
