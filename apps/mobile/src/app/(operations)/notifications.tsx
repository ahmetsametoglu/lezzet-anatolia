import { OperationsNotificationsScreen } from '@/screens/operations/notifications-screen';

/*
  BİLDİRİMLER — sekme grubunun DIŞINDA, kabuğun yığınında. Dosya düzeni tasarımın kuralını
  kendiliğinden veriyor (v2:1097 `tabsVisible: isRoot && …`): sekme çubuğu yalnız bölüm KÖKLERİNDE
  çizilir, yığına girildiğinde kaybolur. `(sections)` grubunun dışında durduğu için bu ekran
  çubuksuz açılır ve geri düğmesiyle kapanır — müşteri kabuğundaki `product/[slug]` ile aynı desen.
*/
export default function NotificationsRoute() {
  return <OperationsNotificationsScreen />;
}
