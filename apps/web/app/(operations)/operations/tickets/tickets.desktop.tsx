'use client';

import { TICKET_TYPE_LABELS } from '@lezzet/types';
import { Button } from '@/components/operation/ui/button';
import { Chip } from '@/components/operation/ui/chip';
import { chatContext } from '@/components/operation/ui/customer-channel-model';
import { PageHeader } from '@/components/operation/ui/page-header';
import { FilterBar, QueuePane } from '@/components/operation/ui/queue-pane';
import { DetailPlaceholder, QueueEmpty, QueueRow, TicketContextPane, TicketDetail } from './tickets-sections';
import { TICKET_FILTERS, TICKET_FILTER_LABELS } from './tickets-url';
import type { TicketsViewProps } from './tickets-types';

/**
 * Kuyruk, talep ve müşteri bağlamı tek ekranda: iade kararının en sık sorusu müşterinin öteki siparişleridir ve kuyruk ayrı
 * sayfada olsaydı operatör her cevaptan sonra listeye dönerdi. Arama kutusu yok: aranan şey (müşteri, sipariş) kendi ekranında aranır.
 */
export function TicketsDesktop({
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
  onReply,
  onStatus,
  onMode,
  onConsumeDraft,
  onSuggestDraft,
  onTakeOver,
  onTriggerReturn,
  onNewTicket,
}: TicketsViewProps) {
  return (
    // `bg-ops-card` şart: çizilmezse başlık ve kuyruk sütunu kabuğun bej zeminini gösterir.
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader
        title="Talepler"
        // Üçüncü sayı yalnız sıfırdan büyükken yazılır: 0 "AI yok" mu "AI'da iş yok" mu, başlık bilemez.
        subtitle={`${data.counts.open} açık · ${data.counts.in_progress} işlemde${data.aiCount > 0 ? ` · ${data.aiCount} AI'da` : ''} · kuyruk son mesaja göre sıralı`}
      >
        <Button variant="dark" size="sm" onClick={onNewTicket}>
          + Elle talep
        </Button>
      </PageHeader>

      <FilterBar>
        {TICKET_FILTERS.map((key) => (
          <Chip key={key} active={urlState.f === key} onClick={() => onFilter(key)}>
            {TICKET_FILTER_LABELS[key]}
          </Chip>
        ))}
      </FilterBar>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <QueuePane
          width={330}
          busy={navPending}
          isEmpty={data.rows.length === 0}
          empty={<QueueEmpty filtered={urlState.f !== 'open'} />}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={onLoadMore}
        >
          {data.rows.map((row) => (
            <QueueRow key={row.id} row={row} active={row.id === urlState.t} onSelect={onSelect} />
          ))}
        </QueuePane>

        {data.detail ? (
          <>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <TicketDetail
                // Talep değişince kutu ve iç durum sıfırlanır: yarım cevap bir sonraki müşterinin penceresinde kalıp yanlış kişiye giderdi.
                key={data.detail.ticket.id}
                detail={data.detail}
                busy={busy}
                error={error}
                onStatus={onStatus}
                onReply={onReply}
                onMode={onMode}
                onConsumeDraft={onConsumeDraft}
                onSuggestDraft={onSuggestDraft}
                onTakeOver={onTakeOver}
                onTriggerReturn={onTriggerReturn}
              />
            </div>
            <TicketContextPane
              context={data.context}
              customerName={data.detail.customer.name}
              // Konusuz talepte tür yazılır: şerit boş kalırsa operatör hangi talepten yazdığını göremez.
              chat={chatContext('Talepten', [
                data.detail.ticket.subject?.trim() || TICKET_TYPE_LABELS[data.detail.ticket.type],
                data.detail.order?.referenceNo,
              ])}
            />
          </>
        ) : (
          <div className="flex min-h-0 flex-1">
            <DetailPlaceholder />
          </div>
        )}
      </div>
    </div>
  );
}
