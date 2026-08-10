import { useLocalSearchParams } from 'expo-router';

import { ProfileSetupScreen } from '@/screens/profile-setup/profile-setup-screen';

/*
  KÜNYE TAMAMLAMA — sekme kabuğunun DIŞINDA (kök `Stack` altında): doğrulamadan sonra bir kez
  sorulan akış, bir sekme değil. Buraya YÖNLENDİRME üç yerden gelir — giriş, OAuth dönüşü ve
  sepet (`screens/profile-setup/use-profile-setup-gate.hook` künyesi); ad ve telefon dolunca akış
  bir daha açılmaz.

  `next` akış bitince dönülecek yol: soruyu soran yer koyar, cevap veren müşteri başladığı yere
  döner. Parametre TEK DEĞER olarak okunur — expo-router aynı adı iki kez taşıyan URL'de dizi
  verir ve o hâlde yönlendirme yolu belirsizdir; belirsizi vitrine indiriyoruz.
*/
export default function ProfileSetupRoute() {
  const { next } = useLocalSearchParams<{ next?: string | string[] }>();
  return <ProfileSetupScreen next={typeof next === 'string' ? next : undefined} />;
}
