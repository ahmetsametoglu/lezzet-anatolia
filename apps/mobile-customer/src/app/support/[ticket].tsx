import { useLocalSearchParams } from 'expo-router';

import { TicketDetailScreen } from '@/screens/support/ticket-detail-screen';

/*
  TALEP DETAYI — rota parametresi talebin KİMLİĞİDİR (uuid), sipariş detayının aksine bir numara
  değil: sözleşme talebe müşteriye gösterilecek kısa bir numara vermiyor (`MeTicketSummarySchema`),
  müşteri talebini listeden açar ve orada tür/konu ile tanır. Bulunamayan ve BAŞKASINA AİT talep
  aynı cevabı alır (404) — ayrım söylenirse kimlik denenerek başkasının talebi doğrulatılabilirdi.
*/
export default function TicketRoute() {
  const { ticket } = useLocalSearchParams<{ ticket: string }>();
  return <TicketDetailScreen id={ticket} />;
}
