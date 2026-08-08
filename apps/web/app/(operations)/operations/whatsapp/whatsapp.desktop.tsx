'use client';

import { Button } from '@/components/operation/ui/button';
import { Chip } from '@/components/operation/ui/chip';
import { PageHeader } from '@/components/operation/ui/page-header';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { ContextPane, ConversationPane, DetailPlaceholder, InboxEmpty, InboxRow } from './whatsapp-sections';
import { WHATSAPP_FILTERS, WHATSAPP_FILTER_LABELS } from './whatsapp-url';
import type { WhatsappViewProps } from './whatsapp-types';

/**
 * WhatsApp konuşma izleme — web (15.5).
 *
 * ÜÇ SÜTUN, TEK EKRAN (çizim): kuyruk · sohbet · müşteri bağlamı. Bağlamı ayrı bir sayfaya koymak
 * operatörü her mesajda müşteri kartına gidip geri döndürürdü; sohbet gün içinde arka arkaya işlenen
 * bir iştir ve bağlam kaybı burada gerçek bir maliyettir.
 *
 * Çip şeridi başlık barının ALTINDA, kendi bandında (Talepler ekranının kalıbı): süzgeç kuyruğa
 * aittir, ekran çapında bir arama değil. Bu ekranda ARAMA KUTUSU YOK ve olmamalı — aranacak şey
 * (müşteri, numara, sipariş) kendi ekranlarında aranır ve oradan buraya bağlantı verilir.
 */
export function WhatsappDesktop({
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
  onRecordInbound,
  onRecordOutbound,
  onNewDm,
  onNewTicket,
}: WhatsappViewProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader
        title="WhatsApp"
        // Çizimin ikinci sayısı ("1 AI yürütüyor") YOK: ajan yazılmadı, bugün her sohbet insanda ve
        // sayı daima 0 gösterirdi — "AI çalışmıyor" değil, "AI yok" diye okunurdu.
        subtitle={`${data.awaitingCount} cevap bekliyor · kuyruk son mesaja göre sıralı`}
      >
        <Button variant="dark" size="sm" onClick={onNewDm}>
          + Gelen DM işle
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2 border-b border-ops-gray-100 px-6 py-2.5">
        {WHATSAPP_FILTERS.map((key) => (
          <Chip key={key} active={urlState.f === key} onClick={() => onFilter(key)}>
            {WHATSAPP_FILTER_LABELS[key]}
          </Chip>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          aria-busy={navPending || undefined}
          className={[
            'flex w-[268px] flex-none flex-col overflow-y-auto border-r border-ops-line',
            navPending ? 'pointer-events-none opacity-60' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {data.rows.length === 0 ? (
            <InboxEmpty filtered={urlState.f === 'awaiting'} />
          ) : (
            <>
              {data.rows.map((row) => (
                <InboxRow key={row.id} row={row} active={row.id === urlState.c} onSelect={onSelect} />
              ))}
              <LoadMoreSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={onLoadMore} />
            </>
          )}
        </div>

        {data.detail ? (
          <>
            <ConversationPane
              detail={data.detail}
              busy={busy}
              error={error}
              onRecordInbound={onRecordInbound}
              onRecordOutbound={onRecordOutbound}
            />
            <ContextPane
              context={data.detail.context}
              // Numara konuşmanın malı, müşterinin değil: kimlik çözülmemiş sohbette de gösterilmeli.
              phone={data.detail.context?.phone ?? data.detail.title}
              tickets={data.detail.tickets}
              onNewTicket={onNewTicket}
            />
          </>
        ) : (
          <DetailPlaceholder />
        )}
      </div>
    </div>
  );
}
