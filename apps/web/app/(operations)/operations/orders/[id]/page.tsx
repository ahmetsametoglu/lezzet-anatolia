import { notFound } from 'next/navigation';
import { serviceDb } from '@lezzet/database';
import { guarded, requireAdmin } from '@/lib/guard';
import { OrderDetailClient } from './order-detail-client';
import { readOrderDetail } from './order-detail-read';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';

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
  if (!access.ok) return <NoAccessPane title="Sipariş" reason="Sipariş tutarları, tahsilat ve müşteri bilgisi operasyonun geri kalanına kapalıdır." />;

  const { id } = await params;
  const order = await readOrderDetail(serviceDb(), id);
  if (!order) notFound();

  return <OrderDetailClient order={order} />;
}

