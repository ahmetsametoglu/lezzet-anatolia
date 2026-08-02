import type { CustomerOrderStatus } from '@lezzet/types';
import { statusPillClass } from '@/components/customer/ui/badge';
import type { Messages } from '../orders-types';

/**
 * Durum rozeti — tasarımın "kapalı liste"si. Masaüstü ve mobil AYNI parçayı kullanır; iki kopya,
 * bir gün ayrışan iki renk paleti demekti.
 *
 * Renkler jetondan geliyor ve envanterin kendi tarifleriyle örtüşüyor: `closed-*` "kapanmış durum
 * etiketi", `terracotta-bright` "hata/iptal metni", `honey-*` "bekleyen durum etiketi" diye
 * tanımlı — yani bu ekran için zaten düşünülmüşler.
 *
 * **Aktif üçlü yeşil ailededir** (tasarım notu): alındı · hazırlanıyor · yolda. Kapanmışlar nötr,
 * iptal kırmızımsı, iade bal rengi. Ayrım renkle YALNIZ değil metinle de var — renk körü müşteri
 * rozeti okuyarak da ayırt eder.
 */
const BADGE_CLASS: Record<CustomerOrderStatus, string> = {
  received: 'bg-olive-bg text-olive',
  preparing: 'bg-olive-bg text-olive',
  on_the_way: 'bg-olive-bg text-olive',
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
