'use client';

import { Button } from '@/components/operation/ui/button';
import { Chip } from '@/components/operation/ui/chip';
import { PageHeader } from '@/components/operation/ui/page-header';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { DetailPlaceholder, QueueEmpty, QueueRow, TicketDetail } from './tickets-sections';
import { TICKET_FILTERS, TICKET_FILTER_LABELS } from './tickets-url';
import type { TicketsViewProps } from './tickets-types';

/**
 * Talepler — web (16.3).
 *
 * İKİ SÜTUN, TEK EKRAN (çizim): solda kuyruk, sağda detay. Kuyruğu ayrı bir sayfaya koymak
 * operatörü her cevap sonrası listeye geri döndürürdü; talepler gün içinde arka arkaya işlenen bir
 * iştir ve bağlam kaybı burada gerçek bir maliyettir.
 *
 * Çip şeridi başlık barının ALTINDA, kendi bandında (çizim): süzgeç kuyruğa aittir, ekran çapında
 * bir arama değil — bu ekranda arama kutusu YOK ve olmamalı, çünkü kuyruk zaten cevap bekleyeni
 * öne alan bir sıraya göre geliyor ve aranacak şey (müşteri, sipariş) kendi ekranlarında aranıyor.
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
  onTakeOver,
  onTriggerReturn,
  onNewTicket,
}: TicketsViewProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Talepler"
        // Sayaç YALNIZ bildiğini söyler: çizim "3 açık · 2 işlemde · 1 AI yürütüyor" yazıyor ama
        // elde durum başına sayım yok (arka uçtan istendi, §8b). Yüklenmiş sayfadan saymak,
        // kuyruk sayfalı olduğu için kalabalık kuyrukta yalan olurdu.
        subtitle={`${data.openCount} açık talep · kuyruk son mesaja göre sıralı`}
      >
        <Button variant="dark" size="sm" onClick={onNewTicket}>
          + Elle talep
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2 border-b border-ops-line-soft px-6 py-2.5">
        {TICKET_FILTERS.map((key) => (
          <Chip key={key} active={urlState.f === key} onClick={() => onFilter(key)}>
            {TICKET_FILTER_LABELS[key]}
          </Chip>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[330px_1fr] overflow-hidden">
        <div
          aria-busy={navPending || undefined}
          className={[
            'flex min-h-0 flex-col overflow-y-auto border-r border-ops-line',
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
          <TicketDetail
            // Talep değişince kutu ve iç durum SIFIRLANIR: yarım kalmış bir cevap bir sonraki
            // müşterinin penceresinde durursa yanlış kişiye gönderilir.
            key={data.detail.ticket.id}
            detail={data.detail}
            busy={busy}
            error={error}
            compact={false}
            onStatus={onStatus}
            onReply={onReply}
            onTakeOver={onTakeOver}
            onTriggerReturn={onTriggerReturn}
          />
        ) : (
          <DetailPlaceholder />
        )}
      </div>
    </div>
  );
}
