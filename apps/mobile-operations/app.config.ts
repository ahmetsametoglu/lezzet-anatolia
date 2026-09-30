import type { ExpoConfig } from 'expo/config';
/* Alt yol ihraçları (paketlerin GİRİŞİ değil): bu dosya Metro'dan ÖNCE Node'un ESM yükleyicisiyle
   değerlendirilir ve paket girişlerinin uzantısız yeniden-ihraçlarını çözemez — gerekçe müşteri
   uygulamasının `app.config.ts` künyesinde, bekçisi `src/lib/app-config-guard.test.ts`. */
import { LOCALES } from '@lezzet/i18n/locale';
import { customerSand } from '@lezzet/design-tokens/customer';

/*
  Operasyon uygulaması ("Lezzet Operasyonu"): personelin native yüzeyi, müşteri uygulamasıyla aynı çekirdeği (`@lezzet/mobile-kit`)
  okur ve ayrı kimlikle kurulur. Ortak değerlerin gerekçesi müşteri uygulamasının `app.config.ts`inde, burada yalnız farklar var.
*/

/* Dış kayıtlar (Expo projesi, Firebase uygulaması, Apple kimliği) kullanıcınındır; değer buraya kayıttan sonra yazılır. */

/* KAMERA İZNİ — yalnız kod okutmak. Dile göre metin `locales/*.json`da; bu cümle desteklenmeyen dildeki
   cihazın gördüğü temel değer, bu yüzden İngilizce. */
const CAMERA_PERMISSION = 'The camera is used to scan product and parcel codes.';

/* BEKLEYEN(21.310): operasyon ikonu tasarımı. O gelene dek müşteri uygulamasının görselleri okunur —
   kopyalanmaz: tek kaynak, ikon gelince yalnız bu yollar değişir. */
const SHARED_IMAGES = '../mobile-customer/assets/images';

const config: ExpoConfig = {
  name: 'Lezzet Operasyonu',
  slug: 'lezzet-operasyonu',
  version: '1.0.0',
  orientation: 'portrait',
  icon: `${SHARED_IMAGES}/icon.png`,
  scheme: 'lezzetoperasyonu',
  userInterfaceStyle: 'automatic',
  updates: {
    enabled: false,
  },
  locales: Object.fromEntries(LOCALES.map((locale) => [locale, `./locales/${locale}.json`])),
  ios: {
    bundleIdentifier: 'com.lezzetanatolie.operasyon',
    infoPlist: { CFBundleAllowMixedLocalizations: true },
  },
  android: {
    package: 'com.lezzetanatolie.operasyon',
    adaptiveIcon: {
      backgroundColor: customerSand['sand-25'],
      foregroundImage: `${SHARED_IMAGES}/android-icon-foreground.png`,
      backgroundImage: `${SHARED_IMAGES}/android-icon-background.png`,
      monochromeImage: `${SHARED_IMAGES}/android-icon-monochrome.png`,
    },
    predictiveBackGestureEnabled: false,
    googleServicesFile: './google-services.json',
  },
  plugins: [
    'expo-router',
    'expo-notifications',
    [
      'expo-splash-screen',
      // Boyut ve zemin müşteri uygulamasının ölçülmüş değerleri (164 dp · maskeli daire, künyesi orada).
      { backgroundColor: customerSand['sand-25'], image: `${SHARED_IMAGES}/splash-icon.png`, imageWidth: 164 },
    ],
    // Gezinme çubuğunun kontrast perdesi kapalı — ölçüm ve gerekçe müşteri uygulamasının künyesinde.
    ['react-native-edge-to-edge', { android: { enforceNavigationBarContrast: false } }],
    'expo-secure-store',
    ['expo-camera', { cameraPermission: CAMERA_PERMISSION }],
    // Brother etiket yazıcısı: SDK diyalogsuz basar, çünkü sistem yazdırma diyaloğu depoda kabul edilmedi.
    'expo-brother-printer-sdk',
    // Dil kümesi tek kaynaktan: ortak giriş ekranı ve toast'lar uygulama dilini okur (operasyon metinleri Türkçe).
    ['expo-localization', { supportedLocales: [...LOCALES] }],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  /* Push jetonu proje kimliğiyle alınır; dinamik yapılandırmaya `eas init` yazamadığı için elle. */
  extra: {
    eas: { projectId: '247c7b75-82be-4d45-aa2b-928448c9e714' },
  },
};

export default config;
