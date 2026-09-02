import type { ExpoConfig } from 'expo/config';
/* Alt yol ihraçları (paketlerin GİRİŞİ değil) — gerekçesi `adaptiveIcon` künyesinde: giriş
   uzantısız yeniden-ihraçlar taşıyor ve Node onları çözemiyor; üçü de yaprak modül. i18n girişi
   26.08'de `./locale` ayrıştırmasıyla aynı tuzağa düştü (`expo start` ERR_MODULE_NOT_FOUND) —
   çare aynı desen: `@lezzet/i18n/{locale,paths}` (künyeleri o dosyalarda). */
import { LOCALES } from '@lezzet/i18n/locale';
import { localizedPath } from '@lezzet/i18n/paths';
import { customerSand } from '@lezzet/design-tokens/customer';

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
  Davet segmentleri `PATHNAMES`ten geliyor (`+native-intent.tsx` ve web'in ilişkilendirme rotası ile
  aynı kaynak, aynı gerekçe): elle yazılan bir liste, rota adı değiştiğinde sessizce eskir ve
  bağlantı bir gün uygulamayı açmaz olur — hata da vermez. **İki davet türü de listede** (21.45):
  komşu daveti kendi segmentlerini kullanıyor (`komsu` · `voisin` · `nachbarn`) ve tek rotaya göre
  yazılmış bir filtre, ikinci rota doğduğunda sessizce eksik kalırdı.
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
      İKON ZEMİNİ MARKA KREMİ VE TOKEN'DAN GELİYOR (25.08) — ham hex kalktı.

      ── ÖNCEKİ KAYDIN İKİ AYRI YANLIŞI ÖLÇÜLDÜ ────────────────────────────────
      Burası `#FFFFFF` yazıyordu ve gerekçesi *"ikon/splash PNG'lerinin zemini beyaz"*dı.
      Piksel okundu: zemin BEYAZ DEĞİLDİ. `icon.png` Expo şablonunun MAVİ gradyanıydı
      (#3EA1FF → #0173DE), `android-icon-background.png` soluk maviydi (#E6F4FE) — yani
      uygulama, markanın değil şablonun ikonuyla taşınıyordu. Ve `splash-icon.png`in 19 310
      opak pikselinin TAMAMI #FFFFFF idi: beyaz perde üstünde beyaz çizim, yani AÇILIŞ PERDESİ
      BOŞ GÖRÜNÜYORDU. İkisi de sessiz kusurdu — hiçbir yerde hata vermiyorlardı.

      ── ZEMİN UYDURULMADI, ÖLÇÜLDÜ ────────────────────────────────────────────
      Marka logosunun kendi zemini #FAF6EC ve bu birebir `customerSand['sand-25']`
      ("sayfa zemini"). Yani ikon, uygulamanın açtığı ilk ekranla AYNI yüzeyi gösteriyor;
      açılışta zemin bir kez zıplamıyor.

      ── PAKET NEDEN NİHAYET OKUNABİLİYOR ──────────────────────────────────────
      Bu dosya Metro'dan ÖNCE, Node'un kendi ESM yükleyicisiyle değerlendiriliyor ve paketin
      GİRİŞİ uzantısız yeniden-ihraçlar taşıyor (`export … from './customer'`) — Node uzantısız
      göreli yola `.ts` eklemez, `expo config` `ERR_MODULE_NOT_FOUND` ile kesiliyordu (MB-42).
      Çare girişi hiç kullanmamak oldu: `customer.ts` YAPRAK modül (hiç göreli import'u yok) ve
      pakete ALT YOL İHRACI eklendi (`"./customer": "./src/customer.ts"`). Ekleme; mevcut düzen
      korundu, depo geneli derleyici bayrağı gerekmedi.
    */
    adaptiveIcon: {
      backgroundColor: customerSand['sand-25'],
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

      Her dil ve her davet türü TEK filtrede: aynı eylem, aynı alan adı, yalnız yol öneki farklı.
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
    // Bildirim modülü (14.14): kanal/ikon yerlileri config plugin ister (v57 dokümanı).
    'expo-notifications',
    [
      'expo-splash-screen',
      {
        // Açılış perdesi ikon zeminiyle AYNI yüzeyi gösterir; ikisi ayrışırsa uygulama açılırken
        // zemin bir kez zıplar. Değer artık token'dan — gerekçe ikon zemininin künyesinde.
        backgroundColor: customerSand['sand-25'],
        image: './assets/images/splash-icon.png',
        /*
          164 dp — büyütme kullanıcı kararı (25.08, *"ekranın ortasında kocaman olsun"*), ÜST SINIR
          ise Android'in. Önceki değer 76 dp'ydi: cihazda ölçüldü, 408 yoğunlukta ekran 423 dp geniş,
          yani işaret genişliğin yalnız %18'i kalıyordu. Şimdi %40 — 2,2 katı.

          ── NEDEN 280 DEĞİL: MASKE HER SÜRÜMDE VAR ───────────────────────────────────────────
          Bir tur 280 yazıldı. Perde işareti **kırpılıyor** — kullanıcı cihazda gördü ve söyledi.
          Sebep: Expo Android 12'nin splash API'sini bildiriyor (`windowSplashScreenAnimatedIcon`) ve
          işaret maskeleniyor — Google'ın deyişiyle *"as with adaptive icons, one-third of the
          foreground is masked"*; ikon zemini yoksa tuval 288 dp, **görünen daire 192 dp**.
          280 dp'de mürekkep 257 dp'ye çıkıyordu, yani daireyi taşıyordu.

          **MASKE API 31'DEN ÖNCE DE VAR** — bir tur "API 30'da uyum katmanı maskelemez" diye yazıldı
          ve YANLIŞTI. androidx'in kendi kaynağı bunu açıkça söylüyor
          (`compat_splash_screen_no_icon_background.xml`): *"We mask the outer bounds of the icon
          **like we do on Android 12**."* Cihazda ölçüldü (Android 11): görünen daire ≈ **191 dp**.

          ── VE CİHAZ TURU BUNU GÖSTERMİŞTİ, GÖZDEN KAÇTI ─────────────────────────────────────
          280'lik derlemenin ekran görüntüsü alınmıştı ve kırpma ORADAYDI; yalnız işaretin BOYU
          ölçülüp bütünlüğü karşılaştırılmadı. Ölçüt basitmiş: kaynak sanatın oranı **1,141**
          (2377×2083), ekrandaki oran **0,85** — kırpılmış bir görüntünün oranı sapar. Bundan sonra
          perde/ikon doğrulaması bu karşılaştırmayı içermeli.

          ── SINIR ÖLÇÜLEREK BULUNDU ───────────────────────────────────────────────────────────
          Mürekkebin merkezden en dış uzaklığı sanat genişliğinin %61,7'si (köşelerde kıvılcım,
          ekmeğin ucu, A'nın ayağı). Sınırlayıcı çemberin 192 dp'ye sığması için mürekkep ≤ 155,6 dp;
          sanat kare tuvalin %92'si olduğundan `imageWidth` ≤ 169,5 dp. Üretilen çizim ÖLÇÜLDÜ ve
          169,5 sınırda 196,5 dp veriyordu (uç pikseller 2,3% taşıyor) — değer **164**'e indirildi,
          ölçülen çap 191,8 dp.

          Kaynak 512² → 1024² büyütüldü: 164 dp × 4 (xxxhdpi) = 672 px, 512'lik kaynak bulanıklaşırdı.
        */
        imageWidth: 164,
      },
    ],
    [
      'react-native-edge-to-edge',
      {
        android: {
          /*
            SİSTEM ÇUBUĞUNUN KONTRAST PERDESİ KAPALI (kullanıcı bulgusu 01.09, cihazda ölçüldü).

            ── BELİRTİ ──────────────────────────────────────────────────────────
            Ekranın en altındaki 16 dp'lik hareket çubuğu şeridi uygulamanın kreminden AÇIK
            çiziliyordu; üstteki durum çubuğu şeridinde aynı sorun YOKTU.

            ── ÖLÇÜM ────────────────────────────────────────────────────────────
            Poco (Android 15 · yoğunluk 480): uygulama zemini `#f2f0e8`, şerit `#fefefd`, sınır
            y=2664. Sayı tesadüf değil — `#fefefd`, kremin ÜSTÜNE %90 opaklıkta beyaz koymanın
            tam sonucu. Yani krem oraya çiziliyor ve üstüne bir PERDE seriliyor.

            Perdeyi Android çiziyor (`Window.isNavigationBarContrastEnforced`) ve açan da
            kütüphanenin kendi teması: `Theme.EdgeToEdge` bu özniteliği varsayılan `true` yapıyor,
            modül de onu okuyup pencereye uyguluyor (`EdgeToEdgeModuleImpl` — `true` dalı). Amacı
            koyu içerikli uygulamalarda çubuğun okunur kalması; bizde ise zaten AÇIK bir zeminin
            üstüne ikinci bir açık katman koyuyor ve tek yaptığı rengi bozmak.

            ── YANLIŞ TEŞHİS KAYDA GEÇİYOR ──────────────────────────────────────
            İlk teori "pencere zemini boyanmamış" idi ve `expo-system-ui` ile boyandı: cihazda
            HİÇBİR ŞEY değişmedi (kayıt `expoRootBackgroundColor = #f2f0e8` yazılmıştı, şerit yine
            aynı). O değişiklik geri alındı — ölçüm teoriyi yalanladığında kod da gider.

            Durum çubuğunda sorun olmamasının sebebi de burada: modül `isStatusBarContrastEnforced`
            değerini her iki dalda da `false` yapıyor, yalnız gezinme çubuğunda ayrım var.

            **NATIVE DEĞİŞİKLİK:** `styles.xml`e yazılır, yani yeniden derleme ister.
          */
          enforceNavigationBarContrast: false,
        },
      },
    ],
    'expo-secure-store',
    [
      // Kamera YALNIZ kod okutmak için (Modül 23) ve izin metni bunu söylüyor — genel bir "kamera
      // erişimi" cümlesi, mağaza incelemesinde de kullanıcı karşısında da fazlasını vaat ederdi.
      // Metin İngilizce+Fransızca değil TEK cümle: operasyon uygulaması personel içindir.
      'expo-camera',
      { cameraPermission: 'Kamera yalnız ürün ve koli kodlarını okutmak için kullanılır.' },
    ],
    // Brother etiket yazıcısı (23.5 iğne deneyi → 23.7 basım): SDK ağ/BT üzerinden diyalogsuz
    // basar (karar §1.8 — sistem yazdırma diyaloğu depoda kabul edilemez, kullanıcı denedi).
    'expo-brother-printer-sdk',
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
