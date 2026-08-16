'use client';

import { Button } from '@/components/operation/ui/button';
import { Chip } from '@/components/operation/ui/chip';
import { PageHeader } from '@/components/operation/ui/page-header';
import { FilterBar, QueuePane } from '@/components/operation/ui/queue-pane';
import { DetailPlaceholder, QueueEmpty, QueueRow, TicketContextPane, TicketDetail } from './tickets-sections';
import { TICKET_FILTERS, TICKET_FILTER_LABELS } from './tickets-url';
import type { TicketsViewProps } from './tickets-types';

/**
 * Talepler — web (16.3).
 *
 * ÜÇ SÜTUN, TEK EKRAN: kuyruk · talep · müşteri bağlamı. Çizim iki sütun çiziyordu ve üçüncüsü
 * 08.08'de eklendi (kullanıcı tespiti): talep detayı müşterinin BAŞKA siparişlerini göstermiyordu,
 * oysa iade kararının en sık sorulan sorusu tam da o. Pano WhatsApp ekranıyla ORTAK
 * (`ui/customer-context-pane`) — aynı soruyu soran iki ekran, tek cevap.
 *
 * Kuyruğu ayrı bir sayfaya koymak operatörü her cevap sonrası listeye geri döndürürdü; talepler gün
 * içinde arka arkaya işlenen bir iştir ve bağlam kaybı burada gerçek bir maliyettir.
 *
 * Kabuk da ORTAK (`QueuePane` · `FilterBar`): süzgeç kuyruğa aittir, ekran çapında bir arama değil —
 * bu ekranda arama kutusu YOK ve olmamalı, çünkü aranacak şey (müşteri, sipariş) kendi ekranlarında
 * aranıyor.
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
    // `bg-ops-card` ŞART ve unutulmuştu: kabuğun zemini `ops-bg` (#dedbd3 — bej; koyu temada
    // #1b1e18) ve zemin çizilmeyince başlık barı ile kuyruk sütunu onu gösteriyordu. Ekran
    // "kahverengiye çalıyor" diye bildirildi (kullanıcı, 03.08).
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader
        title="Talepler"
        // Üçüncü sayı yalnız SIFIRDAN BÜYÜKKEN yazılır: 0 iki şey söyleyebilir ("AI yok" / "AI'da
        // iş yok") ve başlık hangisi olduğunu bilemez — sayı ancak varken bilgi taşır.
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
                // Talep değişince kutu ve iç durum SIFIRLANIR: yarım kalmış bir cevap bir sonraki
                // müşterinin penceresinde durursa yanlış kişiye gönderilir.
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
            <TicketContextPane context={data.context} customerName={data.detail.customer.name} />
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
