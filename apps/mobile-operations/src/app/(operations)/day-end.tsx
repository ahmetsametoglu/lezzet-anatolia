import { MoneyDayEndScreen } from '@/screens/money/day-end-screen';

/*
  M2 · PARA GÜN SONU — `/day-end`. Kuryenin `/day-close`ından AYRI bir adres ve ayrı bir iş: orada
  kurye kendi gününü KAPATIR (yazma), burada muhasebe günün sonucunu OKUR. Aynı ada indirmek, iki
  ayrı yetkiyi tek kelimenin altına gizlemek olurdu.
*/
export default function MoneyDayEndRoute() {
  return <MoneyDayEndScreen />;
}
