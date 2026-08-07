// Kök layout. Unistyles tema kaydı uygulama girişinde BİR KEZ yüklenir (yan etkili import).
import '@/theme/unistyles';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useUnistyles } from 'react-native-unistyles';

/*
  Kök yığın: sekme kabuğu (`(tabs)`) + onun ÜSTÜNE açılan ekranlar (bugün ürün detayı). Tasarımda
  yığına girildiğinde sekme çubuğu gizleniyor (envanter §4); dosya düzeni bunu kendiliğinden
  veriyor — `(tabs)` grubunun dışındaki her rota çubuksuz açılır.

  `contentStyle` zemini: geçiş anında BEYAZ bir kare görünmesin diye. Yığının varsayılan zemini
  platformun kendi rengi (beyaz); uygulamanın zemini ise krem kumdur (`sand-50` — tasarımın telefon
  çerçevesi de o renkte). Değer temadan gelir, ham yazılmaz.
*/
export default function RootLayout() {
  const { theme } = useUnistyles();

  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors['sand-50'] } }} />
      <StatusBar style="auto" />
    </>
  );
}
