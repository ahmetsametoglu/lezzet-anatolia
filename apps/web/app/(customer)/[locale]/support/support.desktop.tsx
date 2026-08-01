'use client';

import { useState } from 'react';
import { LoadMore } from '@/components/customer/ui/load-more';
import type { CustomerTicketView } from '@/lib/ticket/ticket-types';
import { TicketCard } from './components/ticket-card';
import { TicketStatusBadge } from './components/ticket-status-badge';
import { TicketThread } from './components/ticket-thread';
import { ReplyBox } from './components/reply-box';
import { EmptyTickets } from './components/empty-tickets';
import { ticketTitle } from './components/ticket-labels';
import type { SupportViewProps } from './support-types';

/**
 * Taleplerim — masaüstü (tasarım: "Talep Web · iki bölme"). Sol 340px liste, sağda yazışma.
 *
 * **Seçim URL'de yaşar, istemci durumunda değil:** her kart `/support/[ticket]`'a bağ verir. Sebep
 * tasarımın kendi sözleşmesinde yazılı — cevap bildirimi e-postasındaki bağlantı "doğrudan bu
 * talebin yazışmasına" açılmalı. Seçim yalnız istemcide yaşasaydı o bağ diye bir şey olmazdı.
 *
 * `/support` de bir yazışma gösterir (listenin ilki): iki bölmeli bir düzende sağ bölmeyi boş
 * bırakmak, ekranın yarısını "önce soldan bir şey seç" diye bekletmek olurdu.
 */
export function SupportDesktop({ t, locale, tickets, nextCursor, loadingMore, onLoadMore, selected }: SupportViewProps) {
  // Cevap yazıldığında yazışma ANINDA tazelenir; liste satırının "son mesaj"ı sunucudan gelir
  // (action `revalidatePath` çağırıyor) — ikisi ayrı hızda ama ikisi de doğru.
  const [ticket, setTicket] = useState<CustomerTicketView | null>(selected);
  const open = ticket?.id === selected?.id ? ticket : selected;

  if (tickets.length === 0) return <EmptyTickets t={t} />;

  // Yükseklik ZİNCİRİ: `h-full` + her katmanda `min-h-0` — biri unutulursa kaydırma en dışa kaçar
  // ve cevap kutusu yine dipte durmaz. Tasarımın `min-height:420px`i bir maket ölçüsüydü; gerçek
  // ekranda kutunun yeri içeriğin bittiği yer değil, ALANIN dibidir.
  return (
    <div className="grid h-full min-h-0 grid-cols-[340px_1fr]">
      <div className="flex flex-col gap-2.5 overflow-y-auto border-r border-sand-300 p-4.5">
        {tickets.map((row) => (
          <TicketCard key={row.id} t={t} locale={locale} ticket={row} active={row.id === open?.id} />
        ))}
        <LoadMore
          hasMore={nextCursor !== null}
          loading={loadingMore}
          onLoadMore={onLoadMore}
          label={t.loadMore}
          loadingLabel={t.loading}
        />
      </div>

      {open && (
        <div className="flex min-h-0 flex-col px-6 py-4.5">
          <div className="flex flex-none items-center justify-between gap-3 border-b border-sand-200 pb-2.5">
            <span className="font-serif text-lead leading-tight font-semibold text-ink">
              {ticketTitle(open, t)}
              {open.order?.referenceNo && (
                <span className="ml-2 font-sans text-micro font-normal text-muted">
                  — {t.orderBound.replace('{ref}', open.order.referenceNo)}
                </span>
              )}
            </span>
            <TicketStatusBadge t={t} status={open.status} />
          </div>

          {/* Yazışma kendi içinde kayar; kutu kaymaz. Kutunun sabit kalması bir konfor değil bir
              beklenti: mesaj yazarken kaydırma yaparsanız yazdığınız kutu ekrandan çıkmamalı. */}
          <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto py-2.5">
            <TicketThread t={t} locale={locale} ticket={open} wide />
          </div>

          <div className="flex-none">
            <ReplyBox t={t} locale={locale} ticketId={open.id} onReplied={setTicket} />
          </div>
        </div>
      )}
    </div>
  );
}
