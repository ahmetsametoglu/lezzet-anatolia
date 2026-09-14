import { ComplaintsScreen } from '@/screens/management/complaints-screen';

/*
  Y1 · TALEP LİSTESİ — `/complaints`. Detayla (`/complaint`) aynı katmanda ve `(sections)` DIŞINDA:
  yığına girilince sekme çubuğu gizlenir, geri hareketi yönetim köküne döner. Gerekçe tek yerde,
  `complaint.tsx`te. Adres ÇOĞULDUR ve fark anlamlıdır: `/complaint` tek bir talebi, `/complaints`
  kuyruğun tamamını açar.
*/
export default function ComplaintsRoute() {
  return <ComplaintsScreen />;
}
