import { CartScreen } from '@/screens/cart/cart-screen';
import { useProfileSetupGate } from '@/screens/profile-setup/use-profile-setup-gate.hook';

/*
  SEPET — sekme kabuğunun DIŞINDA (kök `Stack` altında): tasarımda sepet bir sekme değildir
  (envanter §4) ve açıldığında sekme çubuğu yerini yapışkan "siparişi tamamla" barına bırakır.
  Dosyanın `(tabs)` grubunda olmaması tam olarak bunu sağlıyor.

  KÜNYE KAPISI ROTADA, EKRANDA DEĞİL (10.08): "künyesi eksikse akışa yolla" bir YÖNLENDİRME
  kararıdır ve rotanın işidir; sepet ekranı sepeti çizer. Ayrım aynı zamanda ekranın testini
  yönlendirici kurgusundan uzak tutar.
*/
export default function CartRoute() {
  useProfileSetupGate({ next: '/cart' });
  return <CartScreen />;
}
