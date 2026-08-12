import type { ExpoConfig } from 'expo/config';
import { LOCALES, localizedPath } from '@lezzet/i18n';

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

/*
  DAVET BAĞLANTISININ SAHİPLENİLMESİ (21.43) — uygulamanın "bu adresler benim" beyanı.

  Davet bağlantısı bir WEB adresidir (`https://…/fr/parrainage/AB12CD34`) ve uygulaması olmayan
  davetli onu tarayıcıda açar. Uygulaması OLAN davetlide aynı adresin uygulamayı açması iki tarafın
  el sıkışmasını gerektirir: burası uygulamanın beyanı, karşılığı alan adı kökünden servis edilen
  ilişkilendirme dosyaları (`apps/web/app/well-known` — o dosya değerleri boşken 404 döner ve bu
  bilinçli, künyesi orada).

  ── ALAN ADI YOKSA BEYAN DA YOK ─────────────────────────────────────────────
  Değer ortamdan gelir ve YERELDE BOŞTUR: `localhost` bir alan adı değildir, ilişkilendirilemez.
  Uydurma bir alan adı yazmak daha kötüdür — işletim sistemi doğrulamayı bir kez yapar ve BAŞARISIZ
  sonucu uzun süre önbelleğe alır; gerçek alan adı geldiğinde bağlantı hâlâ tarayıcıda açılır ve
  sebebi bulunmayan bir arıza olur (CLAUDE §1: ölçülemeyen değer sıfır değildir — burada da
  "bilinmeyen alan adı" boş bir alan adı değildir, beyanın hiç yazılmamasıdır).

  ── YOLLAR TÜRETİLİYOR, YAZILMIYOR ──────────────────────────────────────────
  Üç dilin davet segmenti `PATHNAMES`ten geliyor (`+native-intent.tsx` ile aynı kaynak ve aynı
  gerekçe): elle yazılan bir liste, rota adı değiştiğinde sessizce eskir ve bağlantı bir gün
  uygulamayı açmaz olur — hata da vermez.
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

/** `/tr/davet` gibi — dil öneki + o dilin davet segmenti, sondaki eğik çizgi atılmış. */
function invitePathPrefix(locale: (typeof LOCALES)[number]): string {
  return `/${locale}${localizedPath('/invite/[code]', locale, { code: '' })}`.replace(/\/$/, '');
}

const deepLinkDomain = deepLinkHost(process.env.EXPO_PUBLIC_SITE_URL);

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
  /*
    PAKET KİMLİKLERİ — yerel dev-client derlemesi kimliksiz yapılamıyor (prebuild dinamik config'e
    otomatik yazamaz, 08.08'de ölçüldü). Değer PARAMETRİKTİR ve mağaza başvurusundan önce marka
    alan adıyla kesinleşmeli (ters alan adı kuralı); dev-client için tek şart var olması.
  */
  ios: {
    bundleIdentifier: 'com.lezzetanatolia.app',
    /* Apple tarafında yol SÜZGECİ burada değil, `apple-app-site-association` dosyasındadır
       (`paths` alanı); uygulama yalnız ALAN ADINI beyan eder. Android'in tersi — orada süzgeç
       manifest'te durur (aşağıdaki `intentFilters`). */
    ...(deepLinkDomain ? { associatedDomains: [`applinks:${deepLinkDomain}`] } : {}),
  },
  android: {
    package: 'com.lezzetanatolia.app',
    /*
      NÖTR BEYAZ — HAM HEX, ÖLÇÜLMÜŞ ZORUNLULUK (21.3 kapandı, ölçüm 11.08).

      Kural ham hex yazılmamasını söyler ve doğrusu `@lezzet/design-tokens`ten okumaktır
      (`customerSurface.card` = #ffffff, setin tek saf beyazı). DENENDİ VE ÇÖZÜLEMEDİ: bu dosya
      Metro'dan ÖNCE, Node'un kendi ESM yükleyicisiyle değerlendiriliyor ve paketin girişi
      UZANTISIZ yeniden-ihraçlar taşıyor (`export … from './customer'`). Node uzantısız göreli
      yola `.ts` eklemez; `expo config` şununla kesildi:
          ERR_MODULE_NOT_FOUND · Cannot find module
          '…/packages/design-tokens/src/customer' imported from '…/src/index.ts'
      Sebep paket YOLU ya da workspace çözümü DEĞİL: `@lezzet/i18n` aynı biçimde okunuyor ve
      çalışıyor — çünkü onun girişi tek dosya, göreli yeniden-ihracı yok. Uzantılı göreli
      yeniden-ihraçla kurulmuş bir denek modül aynı yükleyicide SORUNSUZ okundu; yani engel tam
      olarak paketin sekiz uzantısız belirtecidir (`packages/design-tokens/src/*`).

      Düzeltme paketin KENDİ dosyalarında (uzantı eklemek ya da derlenmiş giriş yayımlamak) ve
      web tarafını da ilgilendiriyor; mobil şeridin yazma alanı değil — TERFİ İHTİYACI olarak
      raporlandı. O gün burası tek satırlık bir değişiklikle token'a bağlanır.

      DEĞER NEDEN BEYAZ, KREM DEĞİL: ikon/splash PNG'lerinin zemini beyaz. Renk tek başına marka
      kremine (`sand-50`) çekilirse beyaz zeminli görselin kenarı krem çerçevede görünür bir kare
      bırakır — önce GÖRSELLER krem zemine göre yeniden üretilmeli (tasarım/varlık işi).
    */
    adaptiveIcon: {
      backgroundColor: '#FFFFFF',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    /*
      `autoVerify` olmadan Android bağlantıyı "hangi uygulamayla açayım?" seçicisine düşürür —
      davetliye, hiç görmediği bir uygulamayı kendi seçtirmek olurdu. Doğrulama `assetlinks.json`
      üzerinden yapılır; dosya yoksa (bugünkü hâl) bağlantı sessizce tarayıcıda açılır ve akış
      yine çalışır. `BROWSABLE` kategorisi şart: onsuz tarayıcıdan/mesajdan gelen tıklama filtreye
      hiç uğramaz.

      Üç dil TEK filtrede: aynı eylem, aynı alan adı, yalnız yol öneki farklı.
    */
    ...(deepLinkDomain
      ? {
          intentFilters: [
            {
              action: 'VIEW',
              autoVerify: true,
              data: LOCALES.map((locale) => ({
                scheme: 'https',
                host: deepLinkDomain,
                pathPrefix: invitePathPrefix(locale),
              })),
              category: ['BROWSABLE', 'DEFAULT'],
            },
          ],
        }
      : {}),
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        // Açılış perdesi ikon zeminiyle AYNI yüzeyi gösterir; ikisi ayrışırsa uygulama açılırken
        // zemin bir kez zıplar. Ham hex olmasının gerekçesi ikon zemininin künyesinde (21.3).
        backgroundColor: '#FFFFFF',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
    'react-native-edge-to-edge',
    'expo-secure-store',
    [
      '@stripe/stripe-react-native',
      {
        /*
          YEREL ÖDEME KARTI (kullanıcı kararı 09.08) — yerel modül, CNG eklentisiyle bağlanır;
          native klasörlere elle dosya YAZILMAZ.

          `enableGooglePay` yalnız Android manifest'ine bir `meta-data` satırı ekler (cüzdan API'si
          açık); ödemenin kendisi yine sunucudaki niyetten geçer.

          APPLE PAY BİLEREK KOŞULLU: eklenti `merchantIdentifier` verilince iOS'a
          `com.apple.developer.in-app-payments` ENTITLEMENT'ı yazar. Apple Developer'da KAYITLI
          olmayan bir kimlikle bu entitlement imzalamayı düşürür — yani kayıtsızken alanı yazmak,
          ödemeyi açmak değil DERLEMEYİ kırmak olurdu. Değer tek bir yerden gelir
          (`EXPO_PUBLIC_STRIPE_APPLE_MERCHANT_ID`) ve aynı değişkeni `lib/payment/stripe-config.ts`
          okur: entitlement, `StripeProvider` ve kartın Apple Pay bölümü hep birlikte açılır.
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
