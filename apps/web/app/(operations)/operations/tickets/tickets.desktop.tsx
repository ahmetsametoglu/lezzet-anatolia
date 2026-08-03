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
    // `bg-ops-card` ŞART ve unutulmuştu: kabuğun zemini `ops-bg` (#dedbd3 — bej; koyu temada
    // #1b1e18) ve zemin çizilmeyince başlık barı ile kuyruk sütunu onu gösteriyordu. Ekran
    // "kahverengiye çalıyor" diye bildirildi (kullanıcı, 03.08); öteki sekiz operasyon ekranının
    // hepsi bu sınıfı taşıyor — `min-h-0 flex-1` de onların kalıbı, `h-full` sapmaydı.
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader
        title="Talepler"
        // Çizimin iki sayısı yerinde; üçüncüsü ("AI yürütüyor") 16.5 ile gelir — bugün daima 0
        // gösterirdi ve "AI çalışmıyor" değil "AI yok" diye okunurdu (`TicketsData.counts` künyesi).
        subtitle={`${data.counts.open} açık · ${data.counts.in_progress} işlemde · kuyruk son mesaja göre sıralı`}
      >
        <Button variant="dark" size="sm" onClick={onNewTicket}>
          + Elle talep
        </Button>
      </PageHeader>

      {/* Ayraç `gray-100` (#eef0ea) — çizimin değeri; `line-soft` bir kademe açıktı ve çip şeridi
          başlık barından ayrılmıyordu. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ops-gray-100 px-6 py-2.5">
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
