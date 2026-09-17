'use client';

import { useState } from 'react';
import supportMessages from '@lezzet/i18n/customer/support';
import { EmptyState } from '@/components/customer/phone-kit/empty-state';
import { LoadingState } from '@/components/customer/phone-kit/loading-state';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import type { CustomerTicketView } from '@/lib/ticket/ticket-types';
import { useLoadMore } from '@/lib/use-load-more.hook';
import { TicketStatusBadge } from './components/ticket-status-badge';
import { TicketThread } from './components/ticket-thread';
import { ReplyBox } from './components/reply-box';
import { EmptyTickets } from './components/empty-tickets';
import { PhoneTicketCard } from './components/phone-ticket-card';
import type { SupportViewProps } from './support-types';

/**
 * Taleplerim telefon görünümü: liste ve yazışma iki ayrı ekran ve hangisinin çizileceğini rota söyler. Liste native talep listesinin
 * ikizi; metin iki yüzeyin ortak sözlüğünden.
 */
export function SupportMobile({ t, locale, mode, tickets, nextCursor, loadingMore, tailFailed, onLoadMore, selected }: SupportViewProps) {
  const copy = supportMessages[locale];
  const [ticket, setTicket] = useState<CustomerTicketView | null>(selected);
  const open = ticket?.id === selected?.id ? ticket : selected;
  // Düşen devam kendiliğinden yinelenmez; "tekrar dene" müşterinin elinde.
  const { ref } = useLoadMore({ hasMore: nextCursor !== null && !tailFailed, loading: loadingMore, onLoadMore });

  if (mode === 'detail') {
    // Rota bir talebe işaret ediyor ama kapı boş döndü (silinmiş ya da başkasının) — sayfa zaten
    // `notFound()` veriyor, buraya düşmek yalnız cihaz kararı istemcide değişirse mümkün.
    if (!open) return <EmptyTickets t={t} />;

    // Ekranı DOLDURUR (`SiteFrame fill`): yazışma kendi içinde kayar, cevap kutusu ekranın dibinde
    // sabit durur. Kısa bir yazışmada kutu ortada asılı kalıyordu — mesajlaşma bir sayfa değil,
    // bir alandır.
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3.5">
          <div className="flex flex-none justify-center">
            <TicketStatusBadge t={t} status={open.status} />
          </div>
          <TicketThread t={t} locale={locale} ticket={open} />
        </div>
        <div className="flex-none px-3 pb-3">
          <ReplyBox t={t} locale={locale} ticketId={open.id} onReplied={setTicket} compact />
        </div>
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <EmptyState
        fill
        icon={<MobileIcon name="whatsapp" size={80} className="text-sand-600" />}
        title={copy.list.empty.title}
        description={copy.list.empty.body}
        action={<PrimaryButton label={copy.list.empty.cta} shape="pill" href="/support/new" />}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto px-4.5 pt-4.5 pb-7.5">
      <ul className="flex flex-col gap-2.5">
        {tickets.map((row) => (
          <li key={row.id}>
            <PhoneTicketCard copy={copy} locale={locale} ticket={row} />
          </li>
        ))}
      </ul>
      {/* Kuyruk üç ayrı hâl: yükleniyor, düştü, bitti. */}
      <div ref={ref} className="flex justify-center pt-2.5 empty:pt-0">
        {loadingMore && <LoadingState label={copy.list.loading} />}
        {tailFailed && !loadingMore && <PrimaryButton label={copy.list.tailRetry} shape="pill" onClick={onLoadMore} />}
        {nextCursor === null && <p className="text-center font-sans text-body-sm text-muted">{copy.list.end}</p>}
      </div>
    </div>
  );
}
