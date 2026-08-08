import { AdjustmentScreen } from '@/screens/warehouse/adjustment-screen';

/*
  D4 · SAYIM / DÜZELTME — `/stock-count?stockId=…`. Parti sorguyla gelir (D3'ten); konusuz açılırsa
  ekran bunu söyler. Adres "adjustment" değil "stock-count": operatörün diliyle sayım/düzeltme, iç
  kayıt adıyla değil.
*/
export default function StockCountRoute() {
  return <AdjustmentScreen />;
}
