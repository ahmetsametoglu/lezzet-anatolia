import { ticketMeta, ticketScope, ticketTitle } from '@lezzet/helper';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type supportMessages from '@lezzet/i18n/customer/support';
import { Link } from '@/i18n/navigation';
import { formatOrderDate } from '@/lib/storefront/format';
import type { CustomerTicketSummary } from '@/lib/ticket/ticket-types';
import { PhoneTicketStatusTag } from './phone-ticket-status-tag';

type SupportCopy = LocalizedCopy<typeof supportMessages>;

/** Talep kartı, native liste kartının ikizi: kartın tamamı basılır ve ekran okuyucuya tek satır olarak gider. */
interface PhoneTicketCardProps {
  copy: SupportCopy;
  locale: Locale;
  ticket: CustomerTicketSummary;
}

export function PhoneTicketCard({ copy, locale, ticket }: PhoneTicketCardProps) {
  const title = ticketTitle(copy.type[ticket.type], ticket.subject, copy.list.withSubject);
  const scope = ticketScope(ticket.orderReferenceNo, copy.list.orderScope, copy.list.generalScope);

  return (
    <Link
      href={{ pathname: '/support/[ticket]', params: { ticket: ticket.id } }}
      aria-label={copy.list.open.replace('{type}', title)}
      className="flex cursor-pointer items-center gap-2.5 rounded-card bg-sand-250 px-4 py-3.5 transition-opacity hover:opacity-80"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-sans text-note font-bold text-ink">{title}</span>
        <span className="font-sans text-helper text-muted">
          {ticketMeta(ticket, scope, copy.list.lastMessage, (iso) => formatOrderDate(iso, locale, true))}
        </span>
      </span>
      <PhoneTicketStatusTag status={ticket.status} label={copy.status[ticket.status]} />
      <span aria-hidden className="font-sans text-icon-sm leading-none text-sand-600">
        ›
      </span>
    </Link>
  );
}
