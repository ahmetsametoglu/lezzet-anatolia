import { NotificationsScreen } from '@/screens/notifications/notifications-screen';

/*
  MÜŞTERİ BİLDİRİMLERİ — vitrindeki zilin açtığı yer. Yer tutucuydu (21.13 bekliyordu); uç
  gelince (14.13) gerçek ekrana bağlandı. Operasyon kabuğunun kendi bildirim ekranı ayrıdır
  (`(operations)/notifications.tsx`).
*/
export default function NotificationsRoute() {
  return <NotificationsScreen />;
}
