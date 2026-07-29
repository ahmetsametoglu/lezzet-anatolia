import { notFound } from 'next/navigation';
import { serviceDb } from '@lezzet/database';
import { detectDevice } from '@/lib/device';
import { guarded, requireAdmin } from '@/lib/guard';
import { ErrorState } from '@/components/operation/ui/error-state';
import { AlertIcon } from '@/components/operation/ui/icons';
import { OrderDetailClient } from './order-detail-client';
import { readOrderDetail } from './order-detail-read';

// Sipariş DETAYI (09.7) — tek kaydın tam sayfası, `/operations/orders/<id>`.
//
// Tasarım sözleşmesi yolu `/admin/siparisler/<no>` yazıyor; bizim kuralımız iç yolların İngilizce
// olması (CLAUDE.md §2) — bilinçli sapma, ekranın kendisi birebir.
//
// Listedeki diyalog artık yalnız BAKIŞTIR; kalem düzenleme, kısmi karşılama, iade ve zaman
// çizelgesi buradadır.

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const access = await guarded(requireAdmin);
  if (!access.ok) return <NoAccessPane />;

  const { id } = await params;
  const order = await readOrderDetail(serviceDb(), id);
  if (!order) notFound();

  return <OrderDetailClient order={order} device={await detectDevice()} />;
}

/** Personel ama admin değil — kabuk korunur, yalnız pane kapanır (liste ekranıyla aynı). */
function NoAccessPane() {
  return (
    <ErrorState
      tone="warn"
      icon={<AlertIcon />}
      title="Bu ekran yalnız yöneticiye açık"
      description="Sipariş tutarları, tahsilat ve müşteri bilgisi operasyonun geri kalanına kapalıdır."
    />
  );
}
