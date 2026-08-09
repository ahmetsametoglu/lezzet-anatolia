'use client';

import { Button } from '@/components/operation/ui/button';
import { Chip } from '@/components/operation/ui/chip';
import { PageHeader } from '@/components/operation/ui/page-header';
import { FilterBar, QueuePane } from '@/components/operation/ui/queue-pane';
import { ConversationPane, DetailPlaceholder, InboxEmpty, InboxRow, WhatsappContextPane } from './whatsapp-sections';
import { WHATSAPP_FILTERS, WHATSAPP_FILTER_LABELS } from './whatsapp-url';
import type { WhatsappViewProps } from './whatsapp-types';

/**
 * WhatsApp konuşma izleme — web (15.5).
 *
 * ÜÇ SÜTUN, TEK EKRAN (çizim): kuyruk · sohbet · müşteri bağlamı. Bağlamı ayrı bir sayfaya koymak
 * operatörü her mesajda müşteri kartına gidip geri döndürürdü; sohbet gün içinde arka arkaya işlenen
 * bir iştir ve bağlam kaybı burada gerçek bir maliyettir.
 *
 * Kabuk ORTAK (`QueuePane` · `FilterBar`): Talepler ekranı da aynısını kullanıyor. Bu ekran bir tur
 * boyunca aynı dizilişi kendi içinde yazmıştı — iki kopya bir gün ayrışır ve ayrıştığı gün biri
 * `aria-busy`'yi ya da "daha fazla" gözcüsünü unutur.
 *
 * Bu ekranda ARAMA KUTUSU YOK ve olmamalı — aranacak şey (müşteri, numara, sipariş) kendi
 * ekranlarında aranır ve oradan buraya bağlantı verilir.
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
  onRecordOutbound,
  onIncoming,
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

      <FilterBar>
        {WHATSAPP_FILTERS.map((key) => (
          <Chip key={key} active={urlState.f === key} onClick={() => onFilter(key)}>
            {WHATSAPP_FILTER_LABELS[key]}
          </Chip>
        ))}
      </FilterBar>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <QueuePane
          // 330 px — TALEPLER ekranıyla AYNI (kullanıcı kararı 09.08). İki ekran aynı iskeleti
          // paylaşıyor ve operatör aralarında gezinirken gözü aynı yerde aynı şeyi arıyor; farklı
          // genişlik, ortaklaştırılmış bir satırı yine iki ayrı ekran gibi gösteriyordu.
          // Çizim 208 px veriyor (`.dc.html`) ama o ölçü kendi tuvalinin ölçeğinde: burada başlık
          // + önizleme + üç rozet o genişlikte satırı ikiye bölüyordu.
          width={330}
          busy={navPending}
          isEmpty={data.rows.length === 0}
          empty={<InboxEmpty filtered={urlState.f === 'awaiting'} />}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={onLoadMore}
        >
          {data.rows.map((row) => (
            <InboxRow key={row.id} row={row} active={row.id === urlState.c} onSelect={onSelect} />
          ))}
        </QueuePane>

        {data.detail ? (
          <>
            <ConversationPane
              detail={data.detail}
              busy={busy}
              error={error}
              onIncoming={onIncoming}
              onRecordOutbound={onRecordOutbound}
            />
            <WhatsappContextPane
              context={data.detail.context}
              phone={data.detail.phone}
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
