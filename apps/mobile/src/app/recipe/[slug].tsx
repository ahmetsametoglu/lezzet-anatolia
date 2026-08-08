import { useLocalSearchParams } from 'expo-router';

import { ScreenPlaceholder } from '@/components/screen-placeholder';

/*
  TARİF DETAY — bugün YER TUTUCU (kendi dilimi 21.14'ün SONRAKİ turunda: kahraman foto, malzeme
  listesi "bizden/evinizden" ayrımı, adımlar, "hepsini sepete" yapışkan barı).

  Rota şimdiden var çünkü vitrinin tarif rayı basılınca gidilecek bir yer olmalı; olmasaydı kart
  ya ölü dururdu ya da geçici bir davranış uydurulurdu (`product/[slug]` ile aynı gerekçe).
*/
export default function RecipeRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <ScreenPlaceholder title={slug} />;
}
