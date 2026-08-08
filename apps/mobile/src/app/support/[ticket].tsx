import { useLocalSearchParams } from 'expo-router';

import { TicketDetailScreen } from '@/screens/support/ticket-detail-screen';

/*
  TALEP DETAYI — rota parametresi müşteriye görünen TALEP NUMARASIDIR (`T-108`), kimlik değil:
  sipariş detayının aynı kuralı (müşteriyle konuşurken kullanılan numara odur).
*/
export default function TicketRoute() {
  const { ticket } = useLocalSearchParams<{ ticket: string }>();
  return <TicketDetailScreen id={ticket} />;
}
