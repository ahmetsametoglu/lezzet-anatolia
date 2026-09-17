'use client';

import type { Locale } from '@lezzet/i18n';
import { Link } from '@/i18n/navigation';
import type { CustomerTicketSummary } from '@/lib/ticket/ticket-types';
import { formatOrderDate } from '@/lib/storefront/format';
import { lastMessageLabel, ticketContext, ticketTitle } from './ticket-labels';
import { DesktopTicketStatusBadge } from './desktop-ticket-status-badge';
import type { Messages } from '../support-types';

/**
 * Masaüstü liste kartı: seçili kart kalın zeytin çerçeveli, ötekiler ince kum. Alt satır sipariş, açılış ve son mesajdır; çözülmüş
 * talepte son mesaj yazılmaz, çünkü kapanmış talebin son mesajı bir davet değil kayıttır.
 */
interface DesktopTicketCardProps {
  t: Messages;
  locale: Locale;
  ticket: CustomerTicketSummary;
  active: boolean;
}

export function DesktopTicketCard({ t, locale, ticket, active }: DesktopTicketCardProps) {
  const parts = [ticketContext(ticket.orderReferenceNo, t)];
  if (ticket.status === 'resolved') {
    parts.push(formatOrderDate(ticket.createdAt, locale, true));
  } else {
    parts.push(t.lastMessage.replace('{when}', lastMessageLabel(ticket.lastMessageAt, locale, t)));
  }

  return (
    <Link
      href={{ pathname: '/support/[ticket]', params: { ticket: ticket.id } }}
      className={[
        'flex cursor-pointer flex-col gap-1 rounded-[14px] bg-card px-3.5 py-3 transition-colors hover:border-olive-line',
        active ? 'border-[1.5px] border-olive' : 'border border-sand-200',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-sans text-note leading-tight font-bold text-ink">{ticketTitle(ticket, t)}</span>
        <DesktopTicketStatusBadge t={t} status={ticket.status} compact />
      </div>
      <span className="font-sans text-micro leading-relaxed text-muted">{parts.join(' · ')}</span>
    </Link>
  );
}
