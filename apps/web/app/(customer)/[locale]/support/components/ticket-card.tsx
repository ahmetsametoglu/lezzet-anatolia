'use client';

import type { Locale } from '@lezzet/i18n';
import { Link } from '@/i18n/navigation';
import type { CustomerTicketSummary } from '@/lib/ticket/ticket-types';
import { formatOrderDate } from '@/lib/storefront/format';
import { lastMessageLabel, ticketContext, ticketTitle } from './ticket-labels';
import { TicketStatusBadge } from './ticket-status-badge';
import type { Messages } from '../support-types';

/**
 * Liste kartı — masaüstünün sol bölmesi ve mobil listesi AYNI parçayı kullanır. İki kopya, bir gün
 * ayrışan iki alt satır demekti.
 *
 * **Seçili kart kalın zeytin çerçeveli** (tasarım: `1.5px #5f7a2c`), ötekiler ince kum. Mobilde
 * "seçili" diye bir hâl yok — orada liste ile yazışma ayrı ekranlar — ama aynı çerçeve açık talebi
 * işaretlemek için orada da kullanılıyor (tasarımın mobil listesinde ilk kart öyle çizili).
 *
 * ── ALT SATIRIN ÜÇ PARÇASI ──────────────────────────────────────────────────
 * `{sipariş no ya da "siparişsiz"} · {açılış tarihi} · son mesaj: {ne zaman}`
 *
 * **"Son mesaj" çözülmüş talepte yazılmaz** (tasarım): kapanmış bir talebin son mesajı bir davet
 * değil, bir kayıttır — orada anlamlı olan açılış tarihidir. Masaüstünde açılış tarihi de düşer:
 * yazışma zaten sağ bölmede duruyor, kart yalnız tanımaya yetmeli.
 */
interface TicketCardProps {
  t: Messages;
  locale: Locale;
  ticket: CustomerTicketSummary;
  active: boolean;
  /** Mobil kart: daha geniş, açılış tarihini de taşır. */
  compact?: boolean;
}

export function TicketCard({ t, locale, ticket, active, compact = false }: TicketCardProps) {
  const parts = [ticketContext(ticket.orderReferenceNo, t)];
  if (compact) parts.push(formatOrderDate(ticket.createdAt, locale, true));
  if (ticket.status === 'resolved') {
    if (!compact) parts.push(formatOrderDate(ticket.createdAt, locale, true));
  } else {
    parts.push(t.lastMessage.replace('{when}', lastMessageLabel(ticket.lastMessageAt, locale, t)));
  }

  return (
    <Link
      href={{ pathname: '/support/[ticket]', params: { ticket: ticket.id } }}
      className={[
        'flex cursor-pointer flex-col gap-1 bg-card transition-colors hover:border-olive-line',
        compact ? 'rounded-[16px] p-3.5' : 'rounded-[14px] px-3.5 py-3',
        active ? 'border-[1.5px] border-olive' : 'border border-sand-200',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`truncate font-sans font-bold leading-tight text-ink ${compact ? 'text-body-sm' : 'text-note'}`}>
          {ticketTitle(ticket, t)}
        </span>
        <TicketStatusBadge t={t} status={ticket.status} compact />
      </div>
      <span className="font-sans text-micro leading-relaxed text-muted">{parts.join(' · ')}</span>
    </Link>
  );
}
