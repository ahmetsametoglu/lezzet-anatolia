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
  onSendReply,
  onMode,
  onDefaultMode,
  onConsumeDraft,
  onSuggestDraft,
  onNewTicket,
  onLinkCustomer,
  onOptIn,
  onOpenAnchor,
  onSendCartLink,
  onSendAccountLink,
}: SocialViewProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader
        title="Sosyal Mesajlar"
        // İkinci sayı yalnız SIFIRDAN BÜYÜKKEN yazılır (Talepler başlığıyla aynı gerekçe): 0 iki
        // şey söyleyebilir ("AI yok" / "AI'da iş yok") ve başlık hangisi olduğunu bilemez.
        subtitle={`${data.awaitingCount} cevap bekliyor${data.aiCount > 0 ? ` · ${data.aiCount} AI'da` : ''} · kuyruk son mesaja göre sıralı`}
      >
        {/* Yeni sohbetin VARSAYILAN yürütücüsü (15.30) — Ayarlar'daki satırın aynısı; operatör
            kuyruktayken oraya gitmesin diye burada da. Açık sohbetleri DEĞİŞTİRMEZ: onların
            anahtarı sohbet panosunda ve bu ayrım cümleyle söyleniyor. */}
        <span className="font-ops-body text-ops-micro text-ops-faint">Yeni sohbet:</span>
        <MultiToggle size="sm" label="Yeni sohbetin yürütücüsü" value={data.defaultHandler} options={handlerOptions(busy)} onChange={onDefaultMode} />
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
            // Satır bir KİŞİ (15.38): açık sohbet kişinin herhangi bir kanalıysa satır seçili; basınca süzgece
            // uyan sohbet açılır (`rowTarget`) — "Messenger" çipinde Messenger, "Cevap bekliyor"da bekleyen.
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
              // Sohbet değişince pano SIFIRLANIR (15.39): "Cevap kutusuna taşı"nın metni panonun durumunda ve
              // kutu yeniden kurulurken onu okuyor — anahtar olmasaydı A'nın taslağı B'nin kutusuna düşerdi.
              key={data.detail.id}
              detail={data.detail}
              busy={busy}
              error={error}
              onSendReply={onSendReply}
              onMode={onMode}
              onConsumeDraft={onConsumeDraft}
              onSuggestDraft={onSuggestDraft}
              // Kanal sekmesi (15.38) kuyruk satırıyla aynı kapıdan geçer: seçim adreste (`?c=`), paylaşılabilir.
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
              // Cevap kutusuyla AYNI ölçüt: kutu yalnız pencere açıkken çizilir, sohbete giden bağlantılar da.
              canMessage={humanCanReply(data.detail.window)}
              busy={busy}
              onNewTicket={onNewTicket}
              onLinkCustomer={onLinkCustomer}
              onOptIn={onOptIn}
              onOpenAnchor={onOpenAnchor}
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
