import type { TicketStatus } from '@lezzet/types';
import type { Messages } from '../support-types';

/**
 * Talep durumu rozeti — tasarımın "kapalı liste"si (üç hâl, başkası yok).
 *
 * **İç adlar ekrana çıkmaz** (`design/pages/musteri-talep.md §6`): `open` "Aldık, sıradayız",
 * `in_progress` "İlgileniyoruz", `resolved` "Çözüldü" olur. Çeviri `messages.json`'da; burada
 * yalnız hangi ailenin rengini giydiği yazılı.
 *
 * Renk seçimi sipariş rozetiyle aynı mantığı izliyor ve envanterin tarifleriyle örtüşüyor:
 * `olive-*` "olumlu/işleyen", `honey-*` "bekleyen durum etiketi", `closed-*` "kapanmış durum
 * etiketi". Ayrım renkle YALNIZ değil metinle de var.
 *
 * `resolved` metni `text-ink`: tasarım kapanmış rozette koyu mürekkep kullanıyor (soluk gri değil) —
 * çözülmüş bir talep pasif değil, sonuçlanmıştır.
 */
const BADGE_CLASS: Record<TicketStatus, string> = {
  open: 'bg-olive-bg text-olive',
  in_progress: 'bg-honey-bg text-honey',
  resolved: 'bg-closed-bg text-ink',
};

interface TicketStatusBadgeProps {
  t: Messages;
  status: TicketStatus;
  compact?: boolean;
}

export function TicketStatusBadge({ t, status, compact = false }: TicketStatusBadgeProps) {
  return (
    <span
      className={[
        'flex-none rounded-pill font-sans text-micro font-bold leading-tight',
        compact ? 'px-2.5 py-0.5' : 'px-3 py-1',
        BADGE_CLASS[status],
      ].join(' ')}
    >
      {t.status[status]}
    </span>
  );
}
