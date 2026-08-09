import { OrdersScreen } from '@/screens/orders/orders-screen';

/*
  SİPARİŞLERİM — SEKME DEĞİL, YIĞIN ekranı (kullanıcı kararı 09.08).

  Sekmeden çıktı çünkü zaten Hesabım'ın alt sayfasıydı (ekranın kendi başlığı "HESABIM/Siparişlerim"
  diyor) ve siparişe üç yoldan daha gidiliyordu: hesap menüsü, vitrinin "Siparişiniz yolda · TAKİP"
  bandı ve sipariş onayı. Yerini "Fikirler" (tarifler + paketler) aldı — listesi HİÇ olmayan, satışa
  doğrudan etki eden iki küme.

  YOL DEĞİŞMEDİ (`/orders`): dosya `(tabs)` grubundan köke taşındı, expo-router'da grup adı yola
  girmediği için adres aynı kaldı — hesap menüsündeki bağlantı, onay ekranının `replace`i ve testler
  aynen çalışır. Değişen tek şey kabuktur: `(tabs)` dışındaki her rota sekme çubuğu OLMADAN, yığında
  açılır (kök `_layout` künyesi).

  Rota dosyası İNCE (katalogla aynı gerekçe) — ekranın parçaları `src/screens/orders/`ta.
*/
export default function OrdersRoute() {
  return <OrdersScreen />;
}
