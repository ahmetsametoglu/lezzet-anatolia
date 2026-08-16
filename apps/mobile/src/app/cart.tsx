import { CartScreen } from '@/screens/cart/cart-screen';

/*
  SEPET — sekme kabuğunun DIŞINDA (kök `Stack` altında): tasarımda sepet bir sekme değildir
  (envanter §4) ve açıldığında sekme çubuğu yerini yapışkan "siparişi tamamla" barına bırakır.
  Dosyanın `(tabs)` grubunda olmaması tam olarak bunu sağlıyor.

  KÜNYE KAPISI KALDIRILDI (kullanıcı kararı 15.08). Burada `useProfileSetupGate` vardı: künyesi
  eksik müşteri sepete girerken tamamlama akışına yollanıyordu. Kullanıcının kararı, soruyu sepete
  değil SİPARİŞİN KENDİSİNE bağlamak — *"bunu ilk sipariş verdiği zaman talep edelim"*. Sepet
  gezinmenin parçasıdır: içine bakan, ne kadar tuttuğunu gören, sonra vazgeçen müşteri bir form
  görmemeli. Soru artık ödeme ekranının iletişim bölümünde ve gerekçesi orada yazılı.
*/
export default function CartRoute() {
  return <CartScreen />;
}
