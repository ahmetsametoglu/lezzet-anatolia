import { useLocalSearchParams } from 'expo-router';

import { OrderConfirmedScreen } from '@/screens/checkout/order-confirmed-screen';

/*
  SİPARİŞ ALINDI — checkout'un devamı, kabuk dışında. Değerler AÇILAN siparişten geliyor ve rota
  parametresiyle taşınıyor (ekranın künyesi: tek geçişlik hayat).

  PARAMETRELER METİNDİR (Expo Router'ın kuralı) ve burada sayıya çevrilir. Çevrilemeyen bir tutar
  SIFIRA düşürülmez, `null` geçer (CLAUDE §1): "0,00 €" yazan bir onay ekranı, ölçülemeyen değeri
  ölçülmüş gibi gösterirdi. Ekran o hâlde "bilinmiyor" der.
*/

/** Metin parametreyi tam sayıya çevirir; okunamıyorsa `null` — uydurulmuş bir sayı YAZILMAZ. */
function intOf(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function OrderConfirmedRoute() {
  const params = useLocalSearchParams<{
    orderId?: string;
    reference?: string;
    total?: string;
    delivery?: string;
    payment?: string;
  }>();

  return (
    <OrderConfirmedScreen
      /* Ekranda GÖRÜNMEZ (21.45): yalnız komşu davetini açmaya yarıyor. Uuid müşteriye
         gösterilecek bir numara değil — gösterilen numara `reference`tır ve o hâlâ taşınmıyor. */
      orderId={params.orderId ?? null}
      reference={params.reference ?? null}
      totalCents={intOf(params.total)}
      deliveryLabel={params.delivery ?? ''}
      paymentLabel={params.payment ?? ''}
    />
  );
}
