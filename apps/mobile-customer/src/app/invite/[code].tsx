import { useLocalSearchParams } from 'expo-router';

import { InviteScreen } from '@/screens/invite/invite-screen';

/*
  DAVET ROTASI (21.43) — paylaşılan davet bağlantısının indiği yer.

  ADRES BU ROTAYA BENZEMEZ ve benzemesi de gerekmez: gelen bağlantı web'in şeklindedir
  (`https://…/fr/parrainage/AB12CD34` — dil öneki + üç dilde üç ayrı segment). Çeviriyi
  `app/+native-intent.tsx` yapar ve buraya yalnız kod ulaşır. Uygulamanın rota ağacında dil öneki
  YOKTUR çünkü dil bir CİHAZ tercihidir, adresin parçası değil.

  Parametre bir kimlik değil DAVETİYEDİR: oturum yerine geçmez, kimseye erişim açmaz — yalnız
  "bu kod kimin" sorusunun cevabını getirir (`feedback/[token]`ın tersi; oradaki token oturumun
  KENDİSİDİR).

  Sekme kabuğunun DIŞINDA (kök `Stack` altında): davet bir yığın ekranıdır, sekme çubuğu gizlenir.
*/
export default function InviteRoute() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <InviteScreen code={typeof code === 'string' ? code : ''} />;
}
