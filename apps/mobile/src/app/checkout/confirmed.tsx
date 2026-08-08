import { OrderConfirmedScreen } from '@/screens/checkout/order-confirmed-screen';

/*
  Sipariş alındı — checkout'un devamı, kabuk dışında (21.14). UI-only etap: değerler fixture
  düzeyinde sabit; gerçek sipariş bağlandığında (sonraki etap) parametreler rotadan gelir.
*/
export default function OrderConfirmedRoute() {
  return (
    <OrderConfirmedScreen
      reference="LZA-26-7K1A"
      totalCents={8980}
      deliveryLabel="Yarın · 14:00–18:00"
      paymentLabel="Kapıda ödeme"
      points={89}
    />
  );
}
