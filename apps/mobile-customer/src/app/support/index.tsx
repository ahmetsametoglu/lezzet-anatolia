import { useLocalSearchParams } from 'expo-router';

import { TicketsScreen } from '@/screens/support/tickets-screen';

/*
  TALEPLERİM — sekme kabuğunun DIŞINDA (kök yığın): hesap sekmesinden girilir ve şablonda yığına
  girildiğinde sekme çubuğu gizlenir. Adres web yüzeyiyle AYNI (`/support`): iki yüzeyin aynı
  sayfası aynı adı taşır, e-posta ve bildirim bağlantıları tek yazımdan kurulur.

  İKİ PARAMETRE, İKİSİ DE ÇEKMECEYİ AÇAR (kullanıcı kararı 09.08 — yeni talep artık bu ekranın
  çekmecesi): `?new=1` "bize yazın" demiş bir bağlantıdır, `?order=LA-…` ise sipariş detayından
  gelen ve kapsamı da söyleyen hâlidir. İkisini de `app/support/new.tsx` kabuğu üretiyor; ekran
  yalnız okur — yönlendirme kararı rotanın işi, ekranın değil.
*/
export default function SupportRoute() {
  const { order, new: openNew } = useLocalSearchParams<{ order?: string; new?: string }>();
  return <TicketsScreen orderReference={order} openNew={openNew === '1'} />;
}
