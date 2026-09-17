import type { TicketStatus } from '@lezzet/types';

/**
 * Talep durum rozeti, native `TicketStatusTag`in ikizi: süreç işlerken terracotta, çözülünce zeytin. Küme şemadan gelir, bir durak
 * eklenince bu dosya derlemede kırılır.
 */
const TONE = {
  open: 'bg-terracotta-bg text-terracotta',
  in_progress: 'bg-terracotta-bg text-terracotta',
  resolved: 'bg-olive-bg text-olive-dark',
} as const satisfies Record<TicketStatus, string>;

interface PhoneTicketStatusTagProps {
  status: TicketStatus;
  /** Durumun okunur adı — çeviri çağıranda çözülür. */
  label: string;
}

export function PhoneTicketStatusTag({ status, label }: PhoneTicketStatusTagProps) {
  return (
    <span className={['inline-block flex-none rotate-2 rounded-badge px-3 py-1.5 font-sans text-micro font-bold', TONE[status]].join(' ')}>
      {label}
    </span>
  );
}
