import type { ExpoConfig } from 'expo/config';
/* Paketlerin girişi değil yaprak alt yollar: bu dosyayı Node, Metro'dan önce kendi ESM yükleyicisiyle okur ve girişlerdeki uzantısız
   yeniden ihraçları çözemez. */
import { LOCALES } from '@lezzet/i18n/locale';
import { localizedPath } from '@lezzet/i18n/paths';
import { customerSand } from '@lezzet/design-tokens/customer';
/* Marka adı tek kaynaktan, web'in `brand.name`i de ondan türer; paketin girişini okumak bekçinin yasağı
   (`src/lib/app-config-guard.test.ts`). */
import { BRAND_NAME } from '@lezzet/brand/name';

/*
  Yapılandırma TS'te, çünkü dil kümesi ve rota segmentleri `@lezzet/i18n`den türemeli ve gerekçe değerin yanında durmalı. iOS
  `getLocales()` cevabını `CFBundleLocalizations` listesiyle süzer; liste saparsa Alman cihaz sessizce Fransızca açılır.
*/

/*
  Davet bağlantısı web adresidir; uygulamayı açması için burada alan adı beyan edilir, karşılığı `apps/web/app/well-known`taki
  ilişkilendirme dosyalarıdır. Alan adı yerelde boştur ve uydurulmaz, çünkü işletim sistemi başarısız doğrulamayı uzun süre önbelleğe
  alır; yollar `PATHNAMES`ten türer ki rota adı değişince liste sessizce eskimesin.
*/

/** Beyan edilecek alan adı; boş/yerel/bozuk değerde `null` — o hâlde derin bağlantı yazılmaz. */
function deepLinkHost(siteUrl: string | undefined): string | null {
  if (!siteUrl) return null;
  try {
    const { hostname } = new URL(siteUrl);
    return hostname === 'localhost' || hostname === '127.0.0.1' ? null : hostname;
  } catch {
    // Bozuk değer beyanı KURMAZ: yarım bir ilişkilendirme, hiç ilişkilendirmemekten kötüdür.
    return null;
  }
}

/** Uygulamanın sahiplendiği davet rotaları — web'in `DEEP_LINK_ROUTES` listesiyle aynı küme. */
const DEEP_LINK_ROUTES = ['/invite/[code]', '/neighbor/[token]'] as const;

/** `/tr/davet` gibi — dil öneki + o dilin segmenti, parametre ve sondaki eğik çizgi atılmış. */
function deepLinkPrefixes(): string[] {
  return DEEP_LINK_ROUTES.flatMap((route) =>
    LOCALES.map((locale) => `/${locale}${localizedPath(route, locale)}`.replace(/\/\[[^\]]+\]$/, '')),
  );
}

const deepLinkDomain = deepLinkHost(process.env.EXPO_PUBLIC_SITE_URL);

/*
  Kamerayı bu uygulamada yalnız talebe fotoğraf ekleyen görsel seçici açar; iOS izin cümlesi kullanılmayan bir iş vaat etmemeli.
  Dile göre metin `locales/*.json`da, bu İngilizce değer yalnız desteklenmeyen dildeki cihazın gördüğüdür.
*/
const CAMERA_PERMISSION = 'The camera is used to attach a photo to a support request.';

const config: ExpoConfig = {
  name: BRAND_NAME,
  /* `slug` Expo projesinin adıdır (`@lezzet-anatolie/lezzet-anatolie`); EAS CLI kimliği verilmiş projede adı karşılaştırır ve
     uyuşmazsa her komutu durdurur. */
  slug: 'lezzet-anatolie',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  /* Şema derin bağlantıların, OAuth dönüşünün (`Linking.createURL`) ve 3DS dönüşünün ortak adresi;
     kodda yeniden yazılmaz, hepsi buradan okur. Değişince Supabase'in dönüş izin listesi
     (`supabase/config.toml`) aynı pencerede güncellenir. */
  scheme: 'lezzetanatolie',
  userInterfaceStyle: 'automatic',
  updates: {
    enabled: false,
  },
  /* EAS proje kimliği — push jetonu (`getExpoPushTokenAsync`) onsuz alınamıyor
     (`ERR_NOTIFICATIONS_NO_EXPERIENCE_ID`). Dinamik config'e `eas init` yazamıyor, elle eklendi. */
  extra: {
    eas: { projectId: '1dbe4333-98aa-469c-b443-02746596863f' },
  },
  /*
    Paket kimliği marka alan adının ters yazımı; Firebase, FCM ve Apple kaydı bu değerle, `google-services.json` paketle eşleşmezse
    push çalışmaz. Kimlik değişirse cihazdaki uygulama yeni bir uygulamadır: native klasörler temiz prebuild'le yeniden üretilir.
  */
  /* iOS izin diyaloğu cihazın dilinde açılır; küme `LOCALES`tan türediği için dosyası olmayan yeni dili prebuild söyler, sessizce
     İngilizce temel değere düşmez. */
  locales: Object.fromEntries(LOCALES.map((locale) => [locale, `./locales/${locale}.json`])),
  ios: {
    bundleIdentifier: 'com.lezzetanatolie.app',
    // Yerelleştirilmiş izin metinlerinin ön koşulu (Expo yerelleştirme belgesi).
    infoPlist: { CFBundleAllowMixedLocalizations: true },
    /* Apple tarafında yol SÜZGECİ burada değil, `apple-app-site-association` dosyasındadır
       (`paths` alanı); uygulama yalnız ALAN ADINI beyan eder. Android'in tersi — orada süzgeç
       manifest'te durur (aşağıdaki `intentFilters`). */
    ...(deepLinkDomain ? { associatedDomains: [`applinks:${deepLinkDomain}`] } : {}),
  },
  android: {
    package: 'com.lezzetanatolie.app',
    /* Firebase istemci kimlikleri (FCM). Expo belgesine göre açık tanımlayıcılar taşır ve repoya
       girebilir; GİZLİ olan FCM V1 hizmet hesabı anahtarı yalnız Expo'da durur. */
    googleServicesFile: './google-services.json',
    /* İkon zemini marka logosunun kendi zemini (`sand-25`, sayfa zemini): ikon uygulamanın açtığı ilk ekranla aynı yüzeyi gösterir. */
    adaptiveIcon: {
      backgroundColor: customerSand['sand-25'],
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    /*
      `autoVerify` olmadan Android bağlantıyı "hangi uygulamayla açayım?" seçicisine düşürür; doğrulama `assetlinks.json` ile yapılır,
      dosya yoksa bağlantı tarayıcıda açılır ve akış yine çalışır. `BROWSABLE` şart, onsuz tarayıcıdan ya da mesajdan gelen tıklama
      filtreye uğramaz.
    */
    ...(deepLinkDomain
      ? {
          intentFilters: [
            {
              action: 'VIEW',
              autoVerify: true,
              data: deepLinkPrefixes().map((pathPrefix) => ({ scheme: 'https', host: deepLinkDomain, pathPrefix })),
              category: ['BROWSABLE', 'DEFAULT'],
            },
          ],
        }
      : {}),
  },
  plugins: [
    'expo-router',
    // Bildirim kanalı ve ikonunun native karşılıkları config eklentisi ister (v57 belgesi).
    'expo-notifications',
    [
      'expo-splash-screen',
      {
        // Açılış perdesi ikon zeminiyle aynı yüzeyi gösterir; ikisi ayrışırsa uygulama açılırken zemin bir kez zıplar.
        backgroundColor: customerSand['sand-25'],
        image: './assets/images/splash-icon.png',
        /*
          Android perde işaretini her sürümde dairesel maskeler, ikon zemini yokken görünen daire 192 dp. Mürekkebin merkezden en uzak
          noktası sanat genişliğinin %61,7'si olduğundan 164 dp bu daireye sığan en büyük değer; kaynak 1024², çünkü xxxhdpi 672 px ister.
        */
        imageWidth: 164,
      },
    ],
    [
      'react-native-edge-to-edge',
      {
        android: {
          /*
            Kütüphanenin teması gezinme çubuğuna yarı saydam beyaz bir kontrast perdesi serer (`isNavigationBarContrastEnforced`); açık
            krem zeminde tek etkisi alttaki şeridi açmaktır. Değer `styles.xml`e yazılır, değişince yeniden derleme gerekir.
          */
          enforceNavigationBarContrast: false,
        },
      },
    ],
    'expo-secure-store',
    [
      // Harita altlığı iki platformda Google, web'in karolarıyla aynı görünüm; anahtarlar ortamdan gelir, repoya ve JS paketine girmez.
      'react-native-maps',
      {
        iosGoogleMapsApiKey: process.env.GOOGLE_MAPS_IOS_API_KEY,
        androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY,
      },
    ],
    [
      // Talep fotoğrafı için galeri ve kamera; galeri metni yalnız iOS'ta sorulur. Mikrofon izni istenmez ve Android'de `RECORD_AUDIO`
      // kaldırılır, çünkü kullanılmayan izin mağaza incelemesinde sorulan izindir.
      'expo-image-picker',
      {
        photosPermission: 'Your photos are only used when you choose one for a support request.',
        cameraPermission: CAMERA_PERMISSION,
        microphonePermission: false,
      },
    ],
    [
      '@stripe/stripe-react-native',
      {
        /*
          Apple Pay bilerek koşullu: `merchantIdentifier` verilince eklenti iOS'a `in-app-payments` yetkisini yazar ve Apple'da kayıtlı
          olmayan kimlik imzalamayı düşürür. Değeri `lib/payment/stripe-config.ts` de okur; `enableGooglePay` yalnız manifest'e
          cüzdan satırı ekler.
        */
        enableGooglePay: true,
        ...(process.env.EXPO_PUBLIC_STRIPE_APPLE_MERCHANT_ID
          ? { merchantIdentifier: process.env.EXPO_PUBLIC_STRIPE_APPLE_MERCHANT_ID }
          : {}),
      },
    ],
    [
      'expo-localization',
      {
        /* TEK KAYNAK: dil kümesi `@lezzet/i18n`de yaşar. `LOCALES` salt-okunur bir demet olduğu
           için kopyalanarak geçiliyor — plugin'in şeması değiştirilebilir bir dizi bekliyor ve
           kaynağı olduğu gibi vermek, sözlüğü dışarıya açık bırakmak olurdu. */
        supportedLocales: [...LOCALES],
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
