import { useLocalSearchParams } from 'expo-router';

import { OrderDetailScreen } from '@/screens/orders/order-detail-screen';

/*
  SİPARİŞ DETAY — sekme kabuğunun DIŞINDA (kök yığın): tasarımda yığına girildiğinde sekme
  çubuğu gizleniyor. Rota parametresi sipariş REFERANSIDIR (LA-26-…), kimlik değil: müşteriye
  gösterilen ve destekle konuşurken kullanılan numara odur — uç da (`GET /me/orders/:reference`)
  aynı anahtarı bekliyor.
*/
export default function OrderRoute() {
  const { reference } = useLocalSearchParams<{ reference: string }>();
  return <OrderDetailScreen reference={reference} />;
}
