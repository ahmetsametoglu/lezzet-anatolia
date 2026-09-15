import { brand } from '@lezzet/brand';
import { Image } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { customerMetrics } from '@lezzet/mobile-kit/src/components/customer/customer-metrics';

/** Logo görselinin kaynak oranı (1244×602). */
const LOGO_ASPECT = 1244 / 602;

/** Karşılama ve künye tamamlama adımlarının üstündeki yazılı logo. */
export function OnboardingLogo() {
  return (
    <Image
      // Statik varlık Metro'da `require` ile yüklenir; kural TS içe aktarma disiplinine bakar, varlık yolunu bilmez.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      source={require('@lezzet/mobile-kit/assets/images/logo.png')}
      style={styles.logo}
      accessibilityLabel={brand.name}
    />
  );
}

const styles = StyleSheet.create({
  /* Genişlik orandan hesaplanır, `aspectRatio`ya bırakılmaz: satır kabında `height + aspectRatio` çözülmez ve görsel ham
     boyuna düşer. */
  logo: {
    height: customerMetrics.onboardingLogoHeight,
    width: customerMetrics.onboardingLogoHeight * LOGO_ASPECT,
  },
});
