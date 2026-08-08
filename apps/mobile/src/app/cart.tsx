import { CartScreen } from '@/screens/cart/cart-screen';

/*
  SEPET — sekme kabuğunun DIŞINDA (kök `Stack` altında): tasarımda sepet bir sekme değildir
  (envanter §4) ve açıldığında sekme çubuğu yerini yapışkan "siparişi tamamla" barına bırakır.
  Dosyanın `(tabs)` grubunda olmaması tam olarak bunu sağlıyor.
*/
export default function CartRoute() {
  return <CartScreen />;
}
