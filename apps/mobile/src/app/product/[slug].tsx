import { useLocalSearchParams } from 'expo-router';

import { ScreenPlaceholder } from '@/components/screen-placeholder';

/*
  ÜRÜN DETAY — bugün YER TUTUCU (kendi dilimi ayrı iş: kahraman foto, çeşit çipleri, akordeonlar,
  yapışkan alt bar). Rota şimdiden var çünkü katalog kartının basılınca gideceği bir yer olmalı;
  olmasaydı kartın `onPress`i ya boş dururdu (ölü etkileşim) ya da geçici bir davranış uydurulurdu.

  Sekme kabuğunun DIŞINDA (kök `Stack` altında): tasarımda yığına girildiğinde sekme çubuğu
  gizleniyor (envanter §4) — dosyanın `(tabs)` grubunda olmaması tam olarak bunu sağlıyor.

  Başlık olarak SLUG yazılıyor: bu bir arayüz metni değil, hangi ürüne gelindiğinin kanıtı.
  Yer tutucuya uydurma bir başlık yazmak, olmayan bir tasarım kararı icat etmek olurdu.
*/
export default function ProductScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <ScreenPlaceholder title={slug} />;
}
