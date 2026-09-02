import { StockCountScreen } from '@/screens/warehouse/stock-count-screen';

/*
  D4 · SAYIM — `/stock-count`. Adres "adjustment" değil "stock-count": operatörün diliyle sayım,
  iç kayıt adıyla değil.

  ~~"Parti sorguyla gelir (D3'ten)"~~ — 02.09'da KALKTI: D3 artık imhayı kendi satırında yapıyor
  (21.191) ve konu ekranın kendi seçicisinden geliyor (okut · raf listesi). Rota parametresi
  taşıyan tek yol kapandığı için sorgu da okunmuyor; okunmayan bir parametre, bir gün yanlış
  doldurulacak bir parametredir.
*/
export default function StockCountRoute() {
  return <StockCountScreen />;
}
