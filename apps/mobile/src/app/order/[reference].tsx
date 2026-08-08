import { useLocalSearchParams } from 'expo-router';

import { OrderDetailScreen } from '@/screens/orders/order-detail-screen';

/*
  SİPARİŞ DETAY — sekme kabuğunun DIŞINDA (kök yığın): tasarımda yığına girildiğinde sekme
  çubuğu gizleniyor. Rota parametresi sipariş REFERANSIDIR (LA-2418), kimlik değil: müşteriye
  gösterilen ve destekle konuşurken kullanılan numara odur.
*/
export default function OrderRoute() {
  const { reference } = useLocalSearchParams<{ reference: string }>();
  return <OrderDetailScreen reference={reference} />;
}
