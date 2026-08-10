import { useLocalSearchParams } from 'expo-router';

import { CheckoutScreen } from '@/screens/checkout/checkout-screen';

/*
  CHECKOUT — sepet gibi kabuk dışında (yapışkan özet barı kendi çizer).

  `?group=shipping` bölünmüş sepetin KARGO yarısı için AYRI sipariş demektir (19.15) ve bayrak
  TÜRETİLMEZ, rotadan gelir: türetilseydi ekran adresin cevabını gösterir, sipariş kargo siparişi
  olarak açılırdı (sözleşmenin kendi gerekçesi). Bugün bu yolu üreten bir bağlantı yok — sepet
  ekranı düz `/checkout`a gidiyor; rota parametresi hazır, kapıyı açacak olan sepet ekranıdır.
*/
export default function CheckoutRoute() {
  const { group } = useLocalSearchParams<{ group?: string }>();
  return <CheckoutScreen shippingOrder={group === 'shipping'} />;
}
