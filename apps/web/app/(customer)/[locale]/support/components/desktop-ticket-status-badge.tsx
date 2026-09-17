import type { TicketStatus } from '@lezzet/types';
import { statusPillClass } from '@/components/customer/ui/badge';
import type { Messages } from '../support-types';

/**
 * Talep durumu rozeti: iç adlar ekrana çıkmaz, müşteri "Aldık, sıradayız / İlgileniyoruz / Çözüldü" görür. Çözülmüş rozette koyu
 * mürekkep var, çünkü çözülmüş talep pasif değil sonuçlanmıştır.
 */
const BADGE_CLASS: Record<TicketStatus, string> = {
  open: 'bg-olive-bg text-olive',
  in_progress: 'bg-honey-bg text-honey',
  resolved: 'bg-closed-bg text-ink',
};

interface DesktopTicketStatusBadgeProps {
  t: Messages;
  status: TicketStatus;
  compact?: boolean;
}

export function DesktopTicketStatusBadge({ t, status, compact = false }: DesktopTicketStatusBadgeProps) {
  return <span className={statusPillClass(compact ? 'sm' : 'md', BADGE_CLASS[status])}>{t.status[status]}</span>;
}
