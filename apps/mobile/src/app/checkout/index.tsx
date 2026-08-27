import { useLocalSearchParams } from 'expo-router';

import { CheckoutScreen } from '@/screens/checkout/checkout-screen';

/*
  CHECKOUT — sepet gibi kabuk dışında (yapışkan özet barı kendi çizer).

  `?group=shipping` bölünmüş sepetin KARGO yarısı için AYRI sipariş demektir (19.15) ve bayrak
  TÜRETİLMEZ, rotadan gelir: türetilseydi ekran adresin cevabını gösterir, sipariş kargo siparişi
  olarak açılırdı (sözleşmenin kendi gerekçesi).

  Yolu ÜRETEN İKİ YER var, ikisi de sepet ekranında: bölünmüş sepette kargo grubunun kendi düğmesi
  (`cart-shipping-checkout`) ve salt-kargo sepette yapışkan barın kendisi (`view.shippingOnly` —
  27.08; öncesinde bar düz `/checkout`a gidiyor, yani sepet "kargoyla gönderilir" derken ROTA
  taslağı açılıyordu).
*/
export default function CheckoutRoute() {
  const { group } = useLocalSearchParams<{ group?: string }>();
  return <CheckoutScreen shippingOrder={group === 'shipping'} />;
}
