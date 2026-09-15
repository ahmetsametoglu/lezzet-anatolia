'use client';

import { MultiToggle } from '@/components/operation/form/multi-toggle';
import { handlerOptions } from '@/components/operation/ui/ai-handling';
import { humanCanReply, rowTarget } from './social-read';
import { Chip } from '@/components/operation/ui/chip';
import { PageHeader } from '@/components/operation/ui/page-header';
import { FilterBar, QueuePane } from '@/components/operation/ui/queue-pane';
import { ConversationPane, DetailPlaceholder, InboxEmpty, InboxRow, SocialContextPane } from './social-sections';
import { SOCIAL_CHANNELS, SOCIAL_FILTERS, SOCIAL_FILTER_LABELS } from './social-url';
import { SOURCE_LABELS } from '@/components/operation/ui/conversation-source';
import type { SocialViewProps } from './social-types';

/**
 * Kuyruk, sohbet ve müşteri bağlamı tek ekranda: bağlam ayrı sayfada olsaydı operatör her mesajda müşteri kartına gidip dönerdi.
 * Arama kutusu yok: aranan şey (müşteri, numara, sipariş) kendi ekranında aranır ve oradan buraya bağlantı verilir.
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
  onSendReply,
  onMode,
  onDefaultMode,
  onConsumeDraft,
  onSuggestDraft,
  onNewTicket,
  onOptIn,
  onSendCartLink,
  onSendAccountLink,
}: SocialViewProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader
        title="Sosyal Mesajlar"
        // İkinci sayı yalnız sıfırdan büyükken yazılır: 0 "AI yok" mu "AI'da iş yok" mu, başlık bilemez.
        subtitle={`${data.awaitingCount} cevap bekliyor${data.aiCount > 0 ? ` · ${data.aiCount} AI'da` : ''} · kuyruk son mesaja göre sıralı`}
      >
        {/* Operatör kuyruktayken Ayarlar'a gitmesin diye burada da; açık sohbetleri değiştirmez. */}
        <span className="font-ops-body text-ops-micro text-ops-faint">Yeni sohbet:</span>
        <MultiToggle size="sm" label="Yeni sohbetin yürütücüsü" value={data.defaultHandler} options={handlerOptions(busy)} onChange={onDefaultMode} />
      </PageHeader>

      {/* Durum ve kanal bağımsız eksenlerdir: "cevap bekleyen Messenger sohbetleri" meşru bir sorudur. */}
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
          // Talepler ekranıyla aynı genişlik: operatör iki ekran arasında gezinirken gözü aynı yerde aynı şeyi arar.
          // Çizimin 208 px'i kendi tuvalinin ölçeğinde; burada başlık, önizleme ve rozetler satırı ikiye bölerdi.
          width={330}
          busy={navPending}
          isEmpty={data.rows.length === 0}
          empty={<InboxEmpty filtered={urlState.f !== 'all' || urlState.ch !== 'all'} />}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={onLoadMore}
        >
          {data.rows.map((row) => (
            // Açık sohbet kişinin herhangi bir kanalıysa satır seçilidir.
            <InboxRow
              key={row.id}
              row={row}
              target={rowTarget(row, urlState)}
              active={row.threads.some((thread) => thread.id === urlState.c)}
              onSelect={onSelect}
            />
          ))}
        </QueuePane>

        {data.detail ? (
          <>
            <ConversationPane
              // Sohbet değişince pano sıfırlanır: anahtar olmasaydı A'nın taslağı B'nin cevap kutusuna düşerdi.
              key={data.detail.id}
              detail={data.detail}
              busy={busy}
              error={error}
              onSendReply={onSendReply}
              onMode={onMode}
              onConsumeDraft={onConsumeDraft}
              onSuggestDraft={onSuggestDraft}
              // Kanal sekmesi kuyruk satırıyla aynı kapıdan geçer: seçim adreste, paylaşılabilir.
              onSelectThread={onSelect}
            />
            <SocialContextPane
              context={data.detail.context}
              externalRef={data.detail.externalRef}
              source={data.detail.source}
              profileName={data.detail.profileName}
              tickets={data.detail.tickets}
              consent={data.detail.consent}
              anchor={data.detail.anchor}
              // Cevap kutusuyla aynı ölçüt: sohbete giden bağlantılar da yalnız yazılabilen sohbette.
              canMessage={humanCanReply(data.detail.window)}
              busy={busy}
              onNewTicket={onNewTicket}
              onOptIn={onOptIn}
              onSendCartLink={onSendCartLink}
              onSendAccountLink={onSendAccountLink}
            />
          </>
        ) : (
          <DetailPlaceholder />
        )}
      </div>
    </div>
  );
}
