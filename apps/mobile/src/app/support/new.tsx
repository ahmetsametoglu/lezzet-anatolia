import { useLocalSearchParams } from 'expo-router';

import { NewTicketScreen } from '@/screens/support/new-ticket-screen';

/*
  BİZE YAZIN (yeni talep) — sipariş detayından gelindiğinde referans sorgu parametresiyle taşınır
  (`/support/new?order=LA-2411`) ve akış doğrudan forma açılır; hesap menüsünden gelindiğinde
  parametre yoktur ve ilk soru "bir siparişle mi ilgili?" olur (şablonun kendi kuralı, v3:1698).
*/
export default function NewTicketRoute() {
  const { order } = useLocalSearchParams<{ order?: string }>();
  return <NewTicketScreen orderReference={order} />;
}
