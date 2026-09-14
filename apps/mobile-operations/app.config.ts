import type { ExpoConfig } from 'expo/config';
/* Alt yol ihraçları (paketlerin GİRİŞİ değil): bu dosya Metro'dan ÖNCE Node'un ESM yükleyicisiyle
   değerlendirilir ve paket girişlerinin uzantısız yeniden-ihraçlarını çözemez — gerekçe müşteri
   uygulamasının `app.config.ts` künyesinde, bekçisi `src/lib/app-config-guard.test.ts`. */
import { LOCALES } from '@lezzet/i18n/locale';
import { customerSand } from '@lezzet/design-tokens/customer';

/*
  OPERASYON UYGULAMASI — "Lezzet Operasyonu" (21.310, kullanıcı kararı 14.09). Personelin native
  yüzeyi: müşteri uygulamasıyla aynı ortak çekirdeği (`@lezzet/mobile-kit`) okur, ayrı kimlikle kurulur.
  Ortak değerlerin gerekçeleri müşteri uygulamasının `app.config.ts`inde; burada yalnız FARKLAR.

  ── KİMLİKLER ───────────────────────────────────────────────────────────────
  `slug` Expo projesinin adıdır; paket kimliği marka alan adının ters yazımı + `operasyon`. Dış kayıtlar
  (Expo projesi, Firebase Android uygulaması, Apple uygulama kimliği) KULLANICININ işidir ve değer buraya
  kayıttan SONRA yazılır — koddaki değer dış kayda kopyalanmaz.
  BEKLEYEN(21.310): Expo proje kimliği (`extra.eas.projectId`) ve `google-services.json`. İkisi gelene dek
  push jetonu alınamaz; kayıt kancası bu hâli bilerek sessiz geçer (`register-device` künyesi).

  ── MÜŞTERİDEN FARKLAR ──────────────────────────────────────────────────────
  · Derin bağlantı YOK: davet ve komşu adresleri müşterinin; bu uygulama web adresi sahiplenmez.
  · Ödeme kartı ve görsel seçici YOK; kamera kod okutmak, yazıcı eklentisi etiket basmak için.
  · Tema kökte operasyon teması (`src/app/_layout.tsx`).
*/

/* KAMERA İZNİ — yalnız kod okutmak. Dile göre metin `locales/*.json`da; bu cümle desteklenmeyen dildeki
   cihazın gördüğü temel değer, bu yüzden İngilizce. */
const CAMERA_PERMISSION = 'The camera is used to scan product and parcel codes.';

/* BEKLEYEN(21.310): operasyon ikonu tasarımı. O gelene dek müşteri uygulamasının görselleri okunur —
   kopyalanmaz: tek kaynak, ikon gelince yalnız bu yollar değişir. */
const SHARED_IMAGES = '../mobile/assets/images';

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
  },
  plugins: [
    'expo-router',
    'expo-notifications',
    [
      'expo-splash-screen',
      // Boyut ve zemin müşteri uygulamasının ölçülmüş değerleri (164 dp · maskeli daire, künyesi orada).
      { backgroundColor: customerSand['sand-25'], image: `${SHARED_IMAGES}/splash-icon.png`, imageWidth: 164 },
    ],
    // Gezinme çubuğunun kontrast perdesi kapalı — ölçüm ve gerekçe müşteri uygulamasının künyesinde (01.09).
    ['react-native-edge-to-edge', { android: { enforceNavigationBarContrast: false } }],
    'expo-secure-store',
    ['expo-camera', { cameraPermission: CAMERA_PERMISSION }],
    // Brother etiket yazıcısı (23.5 → 23.7): SDK diyalogsuz basar — sistem yazdırma diyaloğu depoda kabul edilmedi.
    'expo-brother-printer-sdk',
    // Dil kümesi tek kaynaktan: ortak giriş ekranı ve toast'lar uygulama dilini okur (operasyon metinleri Türkçe).
    ['expo-localization', { supportedLocales: [...LOCALES] }],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
