// Kök layout. Unistyles tema kaydı uygulama girişinde BİR KEZ yüklenir (yan etkili import).
import '@/theme/unistyles';

import { loadAsync } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ToastHost } from '@/components/ui/toast-host';
import { useOnboardingGate } from '@/lib/onboarding/use-onboarding-gate.hook';
import { applyFontScale, readFontScale } from '@/lib/settings/font-scale';
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

  if (!fontsReady || !onboardingReady || !scaleReady) return null;

  return (
    /* HAREKET KÖKÜ (09.08) — `react-native-gesture-handler`ın hareketleri yalnız bu kökün ALTINDA
       çalışır ve kök EN DIŞTA olmalı; Android'de dokunuşları buradan dağıtır. Tek kopya, kökte:
       her ekranın kendi kökünü kurması, iki ayrı hareket ağacı demek olurdu. */
    <GestureHandlerRootView style={styles.root}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors['sand-50'] } }} />
      {/* Toast KÖKTE tek kopya (v3 toast katmanı): her ekranın üstünde, dokunuş yutmaz —
          basan taraf `publishToast` (lib/toast), gerekçeler host'un künyesinde. */}
      <ToastHost />
      <StatusBar style="auto" />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  /** Hareket kökü ekranı doldurur; yoksa altındaki yığın ölçüsüz kalır. */
  root: { flex: 1 },
});
