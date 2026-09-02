import { WriteOffScreen } from '@/screens/warehouse/write-off-screen';

/*
  D4b · STOK DÜŞÜMÜ — `/write-off`. Sayımdan AYRI adres, çünkü ayrı iş: sayım kaydı düzeltir,
  düşüm malın gerçekten eksildiğini yazar (hasar · soğuk zincir · kayıp). Süresi geçen mal
  buraya girmez — onun yeri D3.
*/
export default function WriteOffRoute() {
  return <WriteOffScreen />;
}
