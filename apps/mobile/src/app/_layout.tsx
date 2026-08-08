// Kök layout. Unistyles tema kaydı uygulama girişinde BİR KEZ yüklenir (yan etkili import).
import '@/theme/unistyles';

import { loadAsync } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useUnistyles } from 'react-native-unistyles';

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
  if (!fontsReady) return null;

  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors['sand-50'] } }} />
      <StatusBar style="auto" />
    </>
  );
}
