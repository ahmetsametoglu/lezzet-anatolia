import { TicketsScreen } from '@/screens/support/tickets-screen';

/*
  TALEPLERİM — sekme kabuğunun DIŞINDA (kök yığın): hesap sekmesinden girilir ve şablonda yığına
  girildiğinde sekme çubuğu gizlenir. Adres web yüzeyiyle AYNI (`/support`): iki yüzeyin aynı
  sayfası aynı adı taşır, e-posta ve bildirim bağlantıları tek yazımdan kurulur.
*/
export default function SupportRoute() {
  return <TicketsScreen />;
}
