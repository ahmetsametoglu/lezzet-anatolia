import { IntakeScreen } from '@/screens/warehouse/intake-screen';

/*
  D2 · MAL KABUL — `/intake?purchaseOrderId=…`. Konu SORGUDA taşınır, yolda değil: kabul konusuz da
  açılabilir (hub satırı) ve o hâlde ekran "hangi sevkiyat" sorusunu söyler. Yol parametresi olsaydı
  aynı ekran için iki rota dosyası gerekirdi; bekleyen sevkiyat listesi kapısı geldiğinde konu
  buradan geçmeye devam eder.
*/
export default function IntakeRoute() {
  return <IntakeScreen />;
}
