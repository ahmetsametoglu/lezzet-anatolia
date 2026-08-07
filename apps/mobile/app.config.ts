import type { ExpoConfig } from 'expo/config';
import { LOCALES } from '@lezzet/i18n';

/*
  EXPO YAPILANDIRMASI — `app.json`ın yerine geçti (21.7).

  NEDEN TS: statik JSON ne IMPORT edebiliyor ne de YORUM taşıyabiliyordu, ve ikisinin de bedeli
  ölçülmüştü:
  · `supportedLocales` desteklenen dil kümesinin İKİNCİ yazımıydı. iOS `getLocales()` cevabını
    uygulamanın `CFBundleLocalizations` listesiyle SÜZER — liste `@lezzet/i18n`den saparsa Alman
    cihaz sessizce Fransızca açılır. Artık `LOCALES`tan TÜRÜYOR (CLAUDE §1: duplication yok).
  · Gerekçeler dosyanın dışında (README'de) duruyordu; bir değeri değiştiren kişi gerekçeyi
    görmüyordu. Şimdi değerin yanında.

  DEĞER SAYISI DEĞİŞMEDİ: bu bir taşımadır, yeni bir yapılandırma kararı değil — `app.json`daki
  her alan buraya birebir geçti.
*/

const config: ExpoConfig = {
  name: 'Lezzet Anatolia',
  slug: 'lezzet-anatolia',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'lezzetanatolia',
  userInterfaceStyle: 'automatic',
  updates: {
    enabled: false,
  },
  android: {
    adaptiveIcon: {
      // BEKLEYEN(21.3): nötr beyaz — marka kremi (`sand-50`) değil. Token'dan gelmeli, ama önce
      // ikon/splash GÖRSELLERİ krem zemine göre yeniden üretilmeli; renk tek başına değişirse
      // beyaz zeminli PNG'lerin kenarı krem çerçevede görünür bir kare bırakır.
      backgroundColor: '#FFFFFF',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        // BEKLEYEN(21.3): yukarıdaki ikon zeminiyle aynı borç, aynı gerekçe.
        backgroundColor: '#FFFFFF',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
    'react-native-edge-to-edge',
    'expo-secure-store',
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
