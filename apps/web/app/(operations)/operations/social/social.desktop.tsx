'use client';

import { Button } from '@/components/operation/ui/button';
import { Chip } from '@/components/operation/ui/chip';
import { PageHeader } from '@/components/operation/ui/page-header';
import { FilterBar, QueuePane } from '@/components/operation/ui/queue-pane';
import { ConversationPane, DetailPlaceholder, InboxEmpty, InboxRow, SocialContextPane } from './social-sections';
import { SOCIAL_CHANNELS, SOCIAL_FILTERS, SOCIAL_FILTER_LABELS } from './social-url';
import { SOURCE_LABELS } from './social-labels';
import type { SocialViewProps } from './social-types';

/**
 * Sosyal gelen kutusu — web (15.5 · üç kanal 15.15): WhatsApp + Messenger + Instagram DM tek
 * kuyrukta.
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
export function SocialDesktop({
  data,
  urlState,
  navPending,
  busy,
  error,
  hasMore,
  loadingMore,
  onLoadMore,
  onFilter,
  onChannel,
  onSelect,
  onRecordOutbound,
  onMode,
  onConsumeDraft,
  onSuggestDraft,
  onIncoming,
  onNewDm,
  onNewTicket,
  onLinkCustomer,
  onOptIn,
  onStartEmailAnchor,
  onIssueSecurityCode,
}: SocialViewProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader
        title="Sosyal Mesajlar"
        // İkinci sayı yalnız SIFIRDAN BÜYÜKKEN yazılır (Talepler başlığıyla aynı gerekçe): 0 iki
        // şey söyleyebilir ("AI yok" / "AI'da iş yok") ve başlık hangisi olduğunu bilemez.
        subtitle={`${data.awaitingCount} cevap bekliyor${data.aiCount > 0 ? ` · ${data.aiCount} AI'da` : ''} · kuyruk son mesaja göre sıralı`}
      >
        <Button variant="dark" size="sm" onClick={onNewDm}>
          + Gelen DM işle
        </Button>
      </PageHeader>

      {/* İki çip ekseni tek şeritte, ayraçla: durum (Tümü/Cevap bekliyor) ve kanal. Eksenler
          bağımsızdır — "cevap bekleyen Messenger sohbetleri" meşru bir sorudur. */}
      <FilterBar>
        {SOCIAL_FILTERS.map((key) => (
          <Chip key={key} active={urlState.f === key} onClick={() => onFilter(key)}>
            {SOCIAL_FILTER_LABELS[key]}
          </Chip>
        ))}
        <span aria-hidden className="mx-1 h-4 w-px flex-none self-center bg-ops-line" />
        {SOCIAL_CHANNELS.map((key) => (
          <Chip key={key} active={urlState.ch === key} onClick={() => onChannel(key)}>
            {key === 'all' ? 'Tüm kanallar' : SOURCE_LABELS[key]}
          </Chip>
        ))}
      </FilterBar>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <QueuePane
          // 330 px — TALEPLER ekranıyla AYNI (kullanıcı kararı 09.08). İki ekran aynı iskeleti
          // paylaşıyor ve operatör aralarında gezinirken gözü aynı yerde aynı şeyi arıyor; farklı
          // genişlik, ortaklaştırılmış bir satırı yine iki ayrı ekran gibi gösteriyordu.
          // Çizim 208 px veriyor (`.dc.html`) ama o ölçü kendi tuvalinin ölçeğinde: burada başlık
          // + önizleme + rozetler o genişlikte satırı ikiye bölüyordu.
          width={330}
          busy={navPending}
          isEmpty={data.rows.length === 0}
          empty={<InboxEmpty filtered={urlState.f !== 'all' || urlState.ch !== 'all'} />}
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
              onMode={onMode}
              onConsumeDraft={onConsumeDraft}
              onSuggestDraft={onSuggestDraft}
            />
            <SocialContextPane
              context={data.detail.context}
              externalRef={data.detail.externalRef}
              source={data.detail.source}
              profileName={data.detail.profileName}
              tickets={data.detail.tickets}
              onNewTicket={onNewTicket}
              onLinkCustomer={onLinkCustomer}
              optIn={data.detail.optIn}
              anchor={data.detail.anchor}
              onStartEmailAnchor={onStartEmailAnchor}
              onIssueSecurityCode={onIssueSecurityCode}
              busy={busy}
              onOptIn={onOptIn}
            />
          </>
        ) : (
          <DetailPlaceholder />
        )}
      </div>
    </div>
  );
}
