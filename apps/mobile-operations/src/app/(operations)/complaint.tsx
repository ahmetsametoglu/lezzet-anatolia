import { ComplaintScreen } from '@/screens/management/complaint-screen';

/*
  Y1 · ŞİKÂYET — `/complaint`. Karar kutusunun ÜSTÜNE açılır ve `(sections)` DIŞINDA durur (depo/
  kurye alt ekranlarıyla aynı gerekçe): yığına girilince sekme çubuğu gizlenir, geri hareketi
  yönetim köküne döner. Segment İngilizcedir (CLAUDE §2), operasyon yüzeyinde önek yok.
*/
export default function ComplaintRoute() {
  return <ComplaintScreen />;
}
