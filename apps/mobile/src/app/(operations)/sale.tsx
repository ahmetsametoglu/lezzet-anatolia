import { SaleScreen } from '@/screens/sale/sale-screen';

/*
  YERİNDE SATIŞ — `/sale`. Depo hub'ı DA kurye günü DE buraya gelir: satan kişi malın yanındaki
  personeldir (`DOMAIN §17`) ve hangi depodan satıldığını sunucu künyeden çözer — rota bu yüzden
  parametresizdir; ekrana "hangi depo" sorusu taşınmaz.
*/
export default function SaleRoute() {
  return <SaleScreen />;
}
