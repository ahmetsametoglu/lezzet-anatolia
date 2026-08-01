'use client';

import { useState } from 'react';
import { LoadMore } from '@/components/customer/ui/load-more';
import type { CustomerTicketView } from '@/lib/ticket/ticket-types';
import { TicketCard } from './components/ticket-card';
import { TicketStatusBadge } from './components/ticket-status-badge';
import { TicketThread } from './components/ticket-thread';
import { ReplyBox } from './components/reply-box';
import { EmptyTickets } from './components/empty-tickets';
import type { SupportViewProps } from './support-types';

/**
 * Taleplerim — mobil. Masaüstünün dar hâli DEĞİL: orada iki bölme yan yana, burada **iki ayrı
 * ekran** (liste · yazışma) ve hangisinin çizileceğini rota söyler (`mode`).
 *
 * Yazışma ekranında durum rozeti ORTADA duruyor (tasarım), masaüstünde ise başlık satırının
 * sağında — mobilde başlık zaten üst barda ve rozete yer yok; ortada bir çapa olarak duruyor.
 */
export function SupportMobile({ t, locale, mode, tickets, nextCursor, loadingMore, onLoadMore, selected }: SupportViewProps) {
  const [ticket, setTicket] = useState<CustomerTicketView | null>(selected);
  const open = ticket?.id === selected?.id ? ticket : selected;

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

  if (tickets.length === 0) return <EmptyTickets t={t} />;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 overflow-y-auto px-4 py-3.5">
      {/* Kalın zeytin çerçeve masaüstünde "seçili" demek; mobilde seçim diye bir hâl yok, o yüzden
          burada **hâlâ açık olanı** işaretliyor (tasarımın mobil listesinde de çerçeveli olan
          sürmekte olan talep, çözülmüş olan sade). Müşteri hangi işinin devam ettiğini tarayarak
          görür — çerçevenin iki ekranda da anlamı "buraya bak". */}
      {tickets.map((row) => (
        <TicketCard key={row.id} t={t} locale={locale} ticket={row} active={row.status !== 'resolved'} compact />
      ))}
      <LoadMore
        hasMore={nextCursor !== null}
        loading={loadingMore}
        onLoadMore={onLoadMore}
        label={t.loadMore}
        loadingLabel={t.loading}
      />
    </div>
  );
}
