// Kök layout. Unistyles tema kaydı uygulama girişinde BİR KEZ yüklenir (yan etkili import).
import '@/theme/unistyles';

import { loadAsync } from 'expo-font';
import { Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ToastHost } from '@/components/ui/toast-host';
import { useDevAutoLogin } from '@/lib/auth/use-dev-auto-login.hook';
import { initAppLocale } from '@/lib/i18n/app-locale';
import { useOnboardingGate } from '@/lib/onboarding/use-onboarding-gate.hook';
import { PaymentProvider } from '@/lib/payment/payment-provider';
import { useVisitPoints } from '@/lib/points/use-visit-points.hook';
import { usePushNavigation } from '@/lib/push/use-push-navigation.hook';
import { usePushRegistration } from '@/lib/push/use-push-registration.hook';
import { applyFontScale, readFontScale } from '@/lib/settings/font-scale';
import { ensureFreshInstall } from '@/lib/storage/device-store';
import { useCartSync } from '@/screens/customer-kit/cart-store';
import { appFontAssets } from '@/theme/fonts';

/*
  Kök yığın: sekme kabuğu (`(tabs)`) + onun ÜSTÜNE açılan ekranlar (bugün ürün detayı). Tasarımda
  yığına girildiğinde sekme çubuğu gizleniyor (envanter §4); dosya düzeni bunu kendiliğinden
  veriyor — `(tabs)` grubunun dışındaki her rota çubuksuz açılır.

  `contentStyle` zemini: geçiş anında BEYAZ bir kare görünmesin diye. Yığının varsayılan zemini
  platformun kendi rengi (beyaz); uygulamanın zemini ise krem kumdur (`sand-50` — tasarımın telefon
  çerçevesi de o renkte). Değer temadan gelir, ham yazılmaz.

  FONTLAR BURADA, KÖKTE yüklenir (Token Kararlari #24): tek yükleme noktası, çünkü `expo-font`
  aileleri KÜRESEL kaydeder — ikinci bir çağrı aynı işi tekrar eder ve hangi ekranın hangi aileyi
  yüklediği sorusunu doğururdu.
*/

/**
 * SEPETİ OLMAYAN ÜÇ AĞAÇ — kök yığından geçen ama alışverişle ilgisi olmayan yollar.
 *
 * · `(operations)` — personel kabuğu; personelin sepeti yok.
 * · `feedback` · `invite` — kimlik TOKEN'ın kendisidir, ziyaretçi oturumsuz gelir (e-postadaki
 *   link). Burada sepet turu açmak, oturumu olmayan birini oturum altyapısına bağlardı.
 *
 * DAHİL etme değil HARİÇ tutma listesi olması bilinçli: yeni bir müşteri rotası eklendiğinde kapı
 * kendiliğinden AÇIK gelir. Ters kurgu, kapıyı takmayı unutan her yeni ekranda 28.08'de ölçülen
 * arızayı sessizce geri getirirdi (`cart-store.ts` künyesi).
 */
const CARTLESS_TREES = new Set(['(operations)', 'feedback', 'invite']);
export default function RootLayout() {
  const { theme } = useUnistyles();

  /* YENİDEN KURULUM KAPISI (ölçülmüş arıza 09.08, fiziksel iPhone): uygulama silinip yeniden
     kurulunca oturum ve onboarding izi HAYATTA KALIYORDU — iOS Keychain kayıtları uygulama
     silinince silinmez. Karar ve mekanizma `lib/storage/device-store.ts`'te; burada yalnız
     "temizlik bitmeden ağaç ÇİZİLMESİN" var: sonra koşsaydı kullanıcı bir an girişli görünüp
     ardından atılırdı. Depo okumaları aynı sözü kendileri de bekler (tek uçuşlu), bu kapı
     ikinci bir temizlik başlatmaz — yalnız ilk kareyi geciktirir, splash o sırada ekranda. */
  const [installReady, setInstallReady] = useState(false);
  useEffect(() => {
    ensureFreshInstall()
      .then(() => setInstallReady(true))
      // Son emniyet: iç adımlar hatalarını zaten karşılıyor; buraya düşen bir şey olsa bile
      // uygulama açık kalır — kapalı bir kapı, düzeltmeye çalıştığı arızadan beter olurdu.
      .catch(() => setInstallReady(true));
  }, []);

  /* FONT KAPISI — FOUT hükmü (Token Kararları #24) İKİ ölçümle düştü (08.08, ekrana basılan
     teşhisle):
     1. `useFonts(appFontAssets)` bu kurulumda yüklemeyi hiç TAMAMLAMIYOR (`isLoaded` iki kesitte
        de false; aynı haritayla `loadAsync` anında başarılı) — hook, bu sürüm bileşiminde
        (expo-font 57 + yeni mimari) etkisiz.
     2. FOUT'un varsaydığı "yüklenince yeniden çizilir" akmıyor: navigatör ekranları kök
        re-render'ına karşı MEMOIZE — kayıt tamamlansa bile açık ekran sistem fontunda kalıyor
        (ekran-içi setState ile anında Lora'ya döndüğü kanıtlandı).
     Bu yüzden KAPI: yerel varlıklar milisaniyelerde yükleniyor, splash zaten ekranda — ilk kare
     fontlar hazırken çizilir. Yükleme DÜŞERSE kapı açılır ve uygulama sistem fontunda AÇIK kalır
     (boş ekranda kilitlenmek yalanın büyüğü olurdu); kayıt düşülemiyor — log altyapısı yok
     (01-teknoloji §9), altyapı gelince ilk bağlanacak yer burası. */
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    loadAsync(appFontAssets)
      .then(() => setFontsReady(true))
      .catch(() => setFontsReady(true));
  }, []);

  /* ONBOARDING KAPISI — ilk açılışta tek seferlik akışa yönlendirme. Karar ve gerekçeler hook'ta
     (`lib/onboarding/use-onboarding-gate.hook.ts`); burada yalnız "bayrak okunana dek boş kal"
     var — font kapısıyla aynı desen, splash o sırada ekranda. */
  const onboardingReady = useOnboardingGate();

  /* YAZI ÖLÇEĞİ KAPISI (kullanıcı kararı 09.08): kayıtlı seçim İLK kareden önce uygulanır —
     kapısız uygulansa ekran bir an normal boyda çizilip sonra sıçrardı. Okuma düşerse 'normal'
     ile açılır (`readFontScale` kendi içinde sessiz-varsayılanlı). */
  const [scaleReady, setScaleReady] = useState(false);
  useEffect(() => {
    void readFontScale().then((scale) => {
      applyFontScale(scale);
      setScaleReady(true);
    });
  }, []);

  /* DİL KAPISI (kullanıcı kararı 09.08): kayıtlı dil seçimi İLK kareden önce okunur — kapısız
     okunsa ekran bir an cihaz dilinde çizilip seçilen dile sıçrardı. Okuma düşerse cihaz diliyle
     açılır (`initAppLocale` kendi içinde sessiz-varsayılanlı, künyesi orada). */
  const [localeReady, setLocaleReady] = useState(false);
  useEffect(() => {
    void initAppLocale().then(() => setLocaleReady(true));
  }, []);

  /* OTOMATİK DEV GİRİŞİ (kullanıcı isteği 30.08) — yalnız `__DEV__`, yalnız OTURUMSUZ hâlde:
     dört bölümü de gören personelle giriş kurulur, operasyona inişi var olan kural yapar
     (`use-staff-landing`). Üretimde gövdesi hiç koşmaz; gerekçe ve kapatma anahtarı künyede. */
  useDevAutoLogin();

  /* GÜNLÜK GİRİŞ PUANI (MB-50) — bir KAPI DEĞİL, sessiz bir yan etki: ilk karede ve uygulama her
     öne geldiğinde tetiklenir, sonucu beklenmez. Kökte olmasının gerekçesi hook'un künyesinde. */
  useVisitPoints();
  // Push kaydı da kökte ve aynı gerekçeyle (hook künyesi): bir ekrana bağlanamaz.
  usePushRegistration();
  // Bildirime dokunuş → doğru ekran (uygulama içi listeyle AYNI adres sözlüğü — hook künyesi).
  usePushNavigation();

  /* SUNUCU SEPETİNİN KAPISI KÖKE TAŞINDI (ölçüldü 28.08, fiziksel Android).
     Önce sekme kabuğundaydı ve gerekçesi şuydu: "kabuk müşteri ağacının altındaki her yığın
     ekranı boyunca MONTE KALIR". Bu normal gezinmede doğru, DERİN BAĞLANTIDA değil — sepet ·
     ürün · paket · tarif · checkout rotalarının hepsi `(tabs)` grubunun DIŞINDA ve bildirimden
     ya da paylaşılan bir linkten doğrudan açıldıklarında kabuk hiç monte olmuyor. O hâlde kapı
     kapalı kalıyordu ve sonucu sessizdi: girişli müşterinin yazmaları sunucuya HİÇ gitmiyor,
     görünüm de çözülmüyordu — sepet "1 ürün" deyip toplamı "0,00 €" gösteriyordu. Checkout ise
     her zaman SUNUCUDAKİ sepeti okur; yani müşteri gördüğünden başka bir sepeti onaylayabilirdi.

     Kökte durmasının eski gerekçesi ÖLÇÜLDÜ ve artık geçerli değil: "personelin sepeti yoktur,
     orada takmak her personel oturumunda `profile_not_found` dönen bir tur açardı" deniyordu.
     Bugün personelin de profil satırı var (auth↔profile trigger) ve `/api/v1/me/cart` yönetim ile
     depo oturumlarında `200` + BOŞ sepet dönüyor. Maliyet personel başına tek bir boş istek.

     Kapı burada `useVisitPoints`/`usePushRegistration` ile aynı sınıftadır: bir ekrana
     bağlanamayan, kök seviyeli yan etki — ama körlemesine değil: kök yığın müşterinin alışveriş
     ağacından İBARET DEĞİL (`CARTLESS_TREES`). */
  const segments = useSegments();
  useCartSync(!CARTLESS_TREES.has(segments[0] ?? ''));

  /* KÜNYE KAPISI BURADA DEĞİL (kullanıcı kararı 10.08): kökte dururken açık oturumla uygulamayı
     her açanın önüne çıkıyordu. Soru artık anlamlı olduğu üç anda soruluyor — giriş, OAuth
     dönüşü, sepet (`screens/profile-setup/use-profile-setup-gate.hook` künyesi). */

  if (!installReady || !fontsReady || !onboardingReady || !scaleReady || !localeReady) return null;

  return (
    /* ÖDEME SAĞLAYICISI (09.08) — yerel ödeme kartının kök bağlantısı. Anahtar yoksa ağaç
       sarmalanmaz ve uygulama normal açılır; düşen tek şey ödeme kartıdır
       (`lib/payment/stripe-config.ts` künyesi). Saf efekt sağlayıcı olduğu için hareket kökünün
       ÜSTÜNDE durur, dokunuş ağacını bozmaz (ölçüldü). */
    <PaymentProvider>
      {/* HAREKET KÖKÜ (09.08) — `react-native-gesture-handler`ın hareketleri yalnız bu kökün
          ALTINDA çalışır; Android'de dokunuşları buradan dağıtır. Tek kopya, kökte: her ekranın
          kendi kökünü kurması, iki ayrı hareket ağacı demek olurdu. */}
      {/* `app-root`: uygulamanın ÇİZİLDİĞİNİ söyleyen tek kanca (30.08). Uçtan uca akışlar
          (`maestro/common/launch.yaml`) açılışı burada bekler — iki kabuğun (müşteri sekmeleri
          ↔ operasyon sekmeleri) ortak hiçbir kancası yoktu ve akış "hangisini bekleyeyim"
          sorusunu çözemiyordu. Personel oturumu açılışta doğrudan operasyona taşındığı için
          müşteri sekme çubuğunu beklemek de yanlış cevaptı. */}
      <GestureHandlerRootView style={styles.root} testID="app-root">
        {/* ÇEKMECE PORTALI (01.09) — `BottomSheetModal` kendi katmanını buraya asar.

            RN `Modal`ının YERİNE geçen şey bu portal ve göçün asıl sebebi de o: iOS kapanmakta
            olan bir modal'ın üstüne yenisini SUNMUYOR ve çekmecelerimiz o yüzden bazen ekranın
            altında asılı kalıyordu (30.08 mal kabul · 31.08 toplama, ikisi de kullanıcı bulgusu).
            Native modal ortadan kalkınca arıza sınıfı da kalkıyor — dünkü `modal-traffic` kuralı,
            `onDismissed` teli ve emniyet sayacı bu yüzden söküldü.

            Hareket kökünün İÇİNDE: çekmecenin tutamağı ve içine konan her jest (adet rayı) aynı
            köke bağlı olmak zorunda (RNGH kuralı — eski kopyada bu kök Modal'ın içine ayrıca
            konuyordu, portal ağacın kendisinde yaşadığı için artık gerekmiyor). */}
        <BottomSheetModalProvider>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors['sand-50'] } }} />
        </BottomSheetModalProvider>
        {/* Toast KÖKTE tek kopya (v3 toast katmanı): her ekranın üstünde, dokunuş yutmaz —
            basan taraf `toastSuccess`/`toastError`/`toastInfo` (lib/toast), gerekçeler host'un
            künyesinde. */}
        <ToastHost />
        <StatusBar style="auto" />
      </GestureHandlerRootView>
    </PaymentProvider>
  );
}

const styles = StyleSheet.create({
  /** Hareket kökü ekranı doldurur; yoksa altındaki yığın ölçüsüz kalır. */
  root: { flex: 1 },
});
