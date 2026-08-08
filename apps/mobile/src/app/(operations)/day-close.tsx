import { CourierDayCloseScreen } from '@/screens/courier/day-close-screen';

/*
  GÜN KAPANIŞI — `/day-close`. Teslimat ekranıyla aynı gerekçeyle `(sections)` DIŞINDA: yığına
  girilince sekme çubuğu gizlenir (v2'nin kuralı), geri hareketi durak listesine döner.
*/
export default function DayCloseRoute() {
  return <CourierDayCloseScreen />;
}
