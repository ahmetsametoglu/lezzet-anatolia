// Kök layout. Unistyles tema kaydı uygulama girişinde BİR KEZ yüklenir (yan etkili import).
import '@/theme/unistyles';

import { loadAsync } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ToastHost } from '@/components/ui/toast-host';
import { initAppLocale } from '@/lib/i18n/app-locale';
import { useOnboardingGate } from '@/lib/onboarding/use-onboarding-gate.hook';
import { PaymentProvider } from '@/lib/payment/payment-provider';
import { useVisitPoints } from '@/lib/points/use-visit-points.hook';
import { applyFontScale, readFontScale } from '@/lib/settings/font-scale';
import { ensureFreshInstall } from '@/lib/storage/device-store';
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

  /* GÜNLÜK GİRİŞ PUANI (MB-50) — bir KAPI DEĞİL, sessiz bir yan etki: ilk karede ve uygulama her
     öne geldiğinde tetiklenir, sonucu beklenmez. Kökte olmasının gerekçesi hook'un künyesinde. */
  useVisitPoints();

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
      <GestureHandlerRootView style={styles.root}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors['sand-50'] } }} />
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
