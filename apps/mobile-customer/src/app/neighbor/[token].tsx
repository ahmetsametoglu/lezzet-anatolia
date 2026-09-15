import { useLocalSearchParams } from 'expo-router';

import { NeighborScreen } from '@/screens/neighbor/neighbor-screen';

/*
  KOMŞU DAVETİ ROTASI (21.45) — sefer davetinin indiği yer.

  Gelen adres web'in şeklindedir (`https://…/fr/voisin/AB12…`); çeviriyi `app/+native-intent.tsx`
  yapar ve buraya yalnız belirteç ulaşır. Getiren davetinin (`/invite/[code]`) kardeşi ama ayrı
  rota: ikisi farklı şeyi çağırıyor (biri kişiye, öteki bir güne) ve karşılamaları da ayrı.

  Belirteç bir kimlik DEĞİL davetiyedir: oturum yerine geçmez, kimseye erişim açmaz — yalnız
  "hangi sefer, kim çağırdı" sorusunun cevabını getirir.

  Sekme kabuğunun DIŞINDA (kök `Stack` altında): davet bir yığın ekranıdır, sekme çubuğu gizlenir.
*/
export default function NeighborRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <NeighborScreen token={typeof token === 'string' ? token : ''} />;
}
