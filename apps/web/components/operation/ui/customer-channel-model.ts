import type { RankedChannel } from '@lezzet/domain-core';
import type { ConversationSource } from '@lezzet/types';
import { ageMinutesOf, agoShort } from './format';

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
