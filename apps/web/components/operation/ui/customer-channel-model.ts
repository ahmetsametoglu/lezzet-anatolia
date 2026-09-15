import type { RankedChannel } from '@lezzet/domain-core';
import type { ConversationSource } from '@lezzet/types';
import { ageMinutesOf, agoShort, money, shortDate } from './format';

/**
 * Müşterinin bir SOHBET KANALI (15.32 · kullanıcı isteği 14.09: "hangi kanallardan yazdı, en son
 * hangisinden") — müşteriyle konuşmanın gerektiği ekranlardaki kanal düğmesinin verisi.
 *
 * Ayrı bir kolon değil, müşterinin sohbet satırlarından TÜRER (`conversation.customer_id` +
 * `last_inbound_at`): "son kanal" saklansaydı her gelen mesajda iki yere yazılır ve bir gün ayrışırdı.
 */
export interface CustomerChannelView {
  conversationId: string;
  source: ConversationSource;
  /** Müşterinin bu kanaldan son yazışının yaşı (`agoShort`); `null` = hiç yazmadı, sohbeti biz açtık. */
  lastInboundAgo: string | null;
  /** Müşterinin EN SON yazdığı kanal — en çok bir satırda; hiç yazmadıysa hiçbirinde. */
  latest: boolean;
}

export interface CustomerChannelsView {
  /** En son yazdığı kanal önce — sıra ve işaret motordan (`customerChannelsOf`). */
  channels: CustomerChannelView[];
  /**
   * WhatsApp sohbeti yok ama kayıtlı telefon var — sohbeti numarayla BİZ açabiliriz. Yalnız WhatsApp:
   * Messenger/Instagram'da işletme sohbet başlatamaz, ilk sözü müşteri söyler.
   */
  canStartWhatsapp: boolean;
}

/** Motorun sıraladığı bir sohbet (`customerChannelsOf`) — kanal düğmesine gereken alanlar. */
type RankedConversation = RankedChannel<{
  id: string;
  source: ConversationSource;
  lastInboundAt: string | null;
  lastMessageAt: string | null;
}>;

/**
 * Müşterinin kanalları → kanal düğmesinin görünümü. Sıra ve "en son" işareti MOTORDAN gelir
 * (`customerChannelsOf` — native kurye ekranı da aynı kararı okur); burası yalnız yaşı dar biçime çevirir.
 * `now` dışarıdan — ekrandaki bütün yaşlar aynı ana göre.
 */
export function toCustomerChannels(channels: readonly RankedConversation[], now: Date): CustomerChannelView[] {
  const nowMs = now.getTime();
  return channels.map((channel) => ({
    conversationId: channel.id,
    source: channel.source,
    lastInboundAgo: channel.lastInboundAt ? agoShort(ageMinutesOf(channel.lastInboundAt, nowMs)) : null,
    latest: channel.latest,
  }));
}

/** Tek düğmenin hedefi (15.33) — açılacak sohbet, WhatsApp'ı numarayla açmak ya da yazılacak kanal yok. */
export type ChatTarget = { kind: 'conversation'; conversationId: string } | { kind: 'start_whatsapp' } | { kind: 'none' };

/**
 * Listedeki "Mesaj yaz" nereye açılır: müşterinin EN SON yazdığı kanal (sıra motordan — ilk satır); hiç
 * sohbeti yoksa ve telefonu kayıtlıysa WhatsApp sohbeti; o da yoksa hiçbiri — pencere sebebini söyler.
 */
export function chatTargetOf(view: CustomerChannelsView): ChatTarget {
  const first = view.channels[0];
  if (first) return { kind: 'conversation', conversationId: first.conversationId };
  return view.canStartWhatsapp ? { kind: 'start_whatsapp' } : { kind: 'none' };
}

/**
 * Pencerenin taşıdığı BAĞLAM (15.39 · çizim: "sipariş detayından müşteriye yazmak için sayfa değişmez; balon açılır,
 * sipariş bağlamı üstte taşınır"). Açan ekran verir; pencere başlığın alt satırında kaynağı, üst şeritte özeti gösterir
 * ve "Ekle" özeti taslağa yazar — operatör hangi siparişten söz ettiğini elle yazmasın.
 */
export interface MessengerContext {
  /** Açan ekran — "Sipariş detayından". */
  origin: string;
  /** Tek satırlık özet — "LZA-2451 · 92,40 € · 17 Eyl teslim". */
  summary: string;
}

/** Siparişin bağlamı — detay ve önizleme aynı satırı kurar (iki kopya bir gün ayrı biçimde yazardı). */
export function orderChatContext(
  origin: string,
  order: { referenceNo: string | null; totalCents: number; deliveryDate: string | null },
): MessengerContext {
  const parts = [order.referenceNo ?? 'Sipariş', money(order.totalCents)];
  // Gün girilmemişse satıra gün uydurulmaz — müşteriye gidecek bir cümlenin parçası olabilir.
  if (order.deliveryDate) parts.push(`${shortDate(order.deliveryDate)} teslim`);
  return { origin, summary: parts.join(' · ') };
}

/** "Ekle" (15.39): özet taslağın SONUNA, ayrı satırda — yazılmış cümle ezilmez. */
export function appendToDraft(draft: string, line: string): string {
  return draft.trim() ? `${draft.trimEnd()}\n${line}` : line;
}
