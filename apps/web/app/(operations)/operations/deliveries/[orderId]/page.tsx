import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { guarded, requireCourier } from '@/lib/guard';
import { DeliveryClient } from './delivery-client';
import { readDeliveryStop } from './delivery-read';

// **Kapıdaki durak** (`/operations/deliveries/<orderId>`) — 11.2 (teslim onayı), 11.3 (tahsilat),
// 11.4 (ulaşılamadı/reddedildi).
//
// Gün listesindeki bir durağa tıklanınca açılır. Ayrı bir sayfa olmasının sebebi kapıdaki gerçek:
// kurye bu ekranı tek elde, koli taşırken, müşteri karşısında kullanıyor — kalem işaretlemesi ve
// tahsilat bir diyaloğa sığmaz, sığdırılsaydı listenin üstünde açılan bir pencerede yapılan iş
// yanlışlıkla dışarı tıklanınca kaybolurdu.
//
// **Sahiplik yine guard'dan.** Adreste sipariş kimliği var ama kurye kimliği YOK ve olmamalı;
// okuma, durağı kuryenin kendi gününde arayarak başlıyor (`readDeliveryStop`).

interface DeliveryStopPageProps {
  params: Promise<{ orderId: string }>;
}

export default async function DeliveryStopPage({ params }: DeliveryStopPageProps) {
  const access = await guarded(requireCourier);
  if (!access.ok) {
    return (
      <NoAccessPane
        title="Teslimat"
        reason="Bu ekran kuryenin kendi durağı içindir. Siparişin tamamı ve tahsilat geçmişi operasyonun sipariş ekranındadır."
      />
    );
  }

  const { orderId } = await params;
  const view = await readDeliveryStop({ courierId: access.user.id, orderId });

  // `notFound()` DEĞİL: durak var olabilir, yalnız bu kuryenin bugünkü listesinde değildir. "Yok"
  // demek yanlış bilgi olurdu; "sizin listenizde değil" doğrusu ve aynı zamanda başka bir kuryenin
  // durağının varlığını da ele vermez.
  if (!view) {
    return (
      <NoAccessPane
        title="Teslimat"
        reason="Bu durak bugünkü listenizde yok. Plan gün içinde değişmiş olabilir — güne dönüp listeyi tazeleyin."
      />
    );
  }

  return <DeliveryClient view={view} />;
}
