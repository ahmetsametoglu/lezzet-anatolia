// Kök layout. Unistyles tema kaydı uygulama girişinde BİR KEZ yüklenir (yan etkili import).
import '@/theme/unistyles';

import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
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

  /* FOUT KABUL (kararın açık hükmü): yükleme açılışı ENGELLEMEZ, splash uzatılmaz, dönüş değeri
     render'ı dallandırmaz. Fontlar gelene kadar RN sistem fontuna düşer ve `fontWeight` orada
     çalışmaya devam eder — yani ilk kare eksik değil, yalnız başka bir yazıyla çizilir.

     HATA SESSİZ DEĞİL, GÖRÜNÜR: `useFonts` düşerse uygulama kalıcı olarak sistem fontunda kalır
     ve bu ekranda derhâl bellidir. Kayıt DÜŞÜLEMİYOR çünkü mobil istemcinin log altyapısı henüz
     yok (01-teknoloji §9 açık sorusu; `lib/api/client.ts` de aynı yerde duruyor) — `console`
     bu paket için lint kapısında yasak ve `pino` node-only. Altyapı gelince ilk bağlanacak
     yerlerden biri burasıdır. */
  useFonts(appFontAssets);

  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors['sand-50'] } }} />
      <StatusBar style="auto" />
    </>
  );
}
