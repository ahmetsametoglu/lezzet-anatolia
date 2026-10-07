import type { CustomerOrderStatus } from '@lezzet/types';
import { statusPillClass } from '@/components/customer/ui/badge';
import type { Messages } from '../orders-types';

/**
 * Masaüstü durum rozeti; renkler jetonlardan: aktif üçlü yeşil, kapanmış nötr, iptal kırmızımsı, bekleyen ve iade bal rengi. Ayrım
 * metinle de var, renk körü müşteri rozeti okuyarak ayırt eder.
 */
const BADGE_CLASS: Record<CustomerOrderStatus, string> = {
  // Ödeme bekleyen sipariş bekleyen durum ailesinde: sıradaki hareket müşterinin.
  awaiting_payment: 'bg-honey-bg text-honey',
  received: 'bg-olive-bg text-olive-dark',
  preparing: 'bg-olive-bg text-olive-dark',
  // Gel-al'ın "hazır"ı da aktif ailede: müşterinin yapacağı iş var (gidip almak).
  ready_for_pickup: 'bg-olive-bg text-olive-dark',
  on_the_way: 'bg-olive-bg text-olive-dark',
  delivered: 'bg-closed-bg text-closed',
  cancelled: 'bg-terracotta-bg text-terracotta-bright',
  returning: 'bg-honey-bg text-honey',
};

interface OrderStatusBadgeProps {
  t: Messages;
  status: CustomerOrderStatus;
  compact?: boolean;
}

export function OrderStatusBadge({ t, status, compact = false }: OrderStatusBadgeProps) {
  return <span className={statusPillClass(compact ? 'sm' : 'md', BADGE_CLASS[status])}>{t.status[status]}</span>;
}
