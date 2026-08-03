'use client';

import { BottomSheet } from '@/components/operation/ui/bottom-sheet';
import { Button } from '@/components/operation/ui/button';
import { Chip } from '@/components/operation/ui/chip';
import { PageHeader } from '@/components/operation/ui/page-header';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { QueueEmpty, QueueRow, TicketDetail } from './tickets-sections';
import { TICKET_FILTERS, TICKET_FILTER_LABELS } from './tickets-url';
import type { TicketsViewProps } from './tickets-types';

/**
 * Talepler — mobil (16.3).
 *
 * **Telefon önceliklidir** (`admin-talepler.md §7`): talepler gün içinde düşer ve cevap çoğu zaman
 * telefonda yazılır. Kuyruk tam ekran, detay ALT TABAKA (çizim) — iki sütun telefonda okunmaz.
 *
 * Tabaka gerçek gezinmedir (`?t=`), bir örtü değil: geri tuşu kuyruğa döner. Örtü olsaydı geri
 * tuşu operatörü ekrandan tamamen çıkarırdı — telefonda en sık basılan tuş budur.
 */
export function TicketsMobile({
  data,
  urlState,
  navPending,
  busy,
  error,
  hasMore,
  loadingMore,
  onLoadMore,
  onFilter,
  onSelect,
  onCloseDetail,
  onReply,
  onStatus,
  onTakeOver,
  onTriggerReturn,
  onNewTicket,
}: TicketsViewProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      {/* Telefonda iki sayı yan yana sığıyor; "kuyruk son mesaja göre sıralı" cümlesi düşüyor —
          dar ekranda satırı ikiye bölerdi ve sıralama zaten listede görünüyor. */}
      <PageHeader compact title="Talepler" subtitle={`${data.counts.open} açık · ${data.counts.in_progress} işlemde`}>
        <Button variant="dark" size="sm" onClick={onNewTicket}>
          + Elle
        </Button>
      </PageHeader>

      {/* Çip şeridi yatay kaydırılır: dört çip dar ekranda alt alta düşerse kuyruk iki satır aşağı
          iner ve ilk bakışta görünen talep sayısı düşer. */}
      <div className="flex gap-2 overflow-x-auto border-b border-ops-gray-100 px-4 py-2.5">
        {TICKET_FILTERS.map((key) => (
          <Chip key={key} active={urlState.f === key} onClick={() => onFilter(key)} className="flex-none">
            {TICKET_FILTER_LABELS[key]}
          </Chip>
        ))}
      </div>

      <div
        aria-busy={navPending || undefined}
        className={[
          'flex min-h-0 flex-1 flex-col overflow-y-auto',
          navPending ? 'pointer-events-none opacity-60' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {data.rows.length === 0 ? (
          <QueueEmpty filtered={urlState.f !== 'open'} />
        ) : (
          <>
            {data.rows.map((row) => (
              <QueueRow key={row.id} row={row} active={row.id === urlState.t} onSelect={onSelect} />
            ))}
            <LoadMoreSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={onLoadMore} />
          </>
        )}
      </div>

      {data.detail ? (
        <BottomSheet label="Talep detayı" scrollable onClose={onCloseDetail}>
          <div className="flex min-h-0 flex-1 flex-col">
            <TicketDetail
              key={data.detail.ticket.id}
              detail={data.detail}
              busy={busy}
              error={error}
              compact
              onStatus={onStatus}
              onReply={onReply}
              onTakeOver={onTakeOver}
              onTriggerReturn={onTriggerReturn}
            />
          </div>
        </BottomSheet>
      ) : null}
    </div>
  );
}
