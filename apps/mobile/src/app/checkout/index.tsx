import { CheckoutScreen } from '@/screens/checkout/checkout-screen';

// CHECKOUT — sepet gibi kabuk dışında (yapışkan özet barı kendi çizer). Rota, ajan koşusu
// durdurulduğunda eksik kalmıştı (21.14); ekran hazırdı — yalnız sarmalayıcı yazıldı.
export default function CheckoutRoute() {
  return <CheckoutScreen />;
}
