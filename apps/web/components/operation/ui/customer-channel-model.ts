import type { RankedChannel } from '@lezzet/domain-core';
import type { ConversationSource } from '@lezzet/types';
import { ageMinutesOf, agoShort, money, shortDate } from './format';

/** Ayrı kolon değil, müşterinin sohbet satırlarından türer: "son kanal" saklansaydı her gelen mesajda iki yere yazılır ve bir gün ayrışırdı. */
export interface CustomerChannelView {
  conversationId: string;
  source: ConversationSource;
  /** `null` = müşteri bu kanaldan hiç yazmadı, sohbeti biz açtık. */
  lastInboundAgo: string | null;
  /** En çok bir satırda; müşteri hiç yazmadıysa hiçbirinde. */
  latest: boolean;
}

export interface CustomerChannelsView {
  channels: CustomerChannelView[];
  /** Yalnız WhatsApp: Messenger/Instagram'da işletme sohbet başlatamaz, ilk sözü müşteri söyler. */
  canStartWhatsapp: boolean;
}

type RankedConversation = RankedChannel<{
  id: string;
  source: ConversationSource;
  lastInboundAt: string | null;
  lastMessageAt: string | null;
}>;

/** Sıra ve "en son" işareti motordan (`customerChannelsOf`) gelir: native kurye ekranı da aynı kararı okur. */
export function toCustomerChannels(channels: readonly RankedConversation[], now: Date): CustomerChannelView[] {
  const nowMs = now.getTime();
  return channels.map((channel) => ({
    conversationId: channel.id,
    source: channel.source,
    lastInboundAgo: channel.lastInboundAt ? agoShort(ageMinutesOf(channel.lastInboundAt, nowMs)) : null,
    latest: channel.latest,
  }));
}

export type ChatTarget = { kind: 'conversation'; conversationId: string } | { kind: 'start_whatsapp' } | { kind: 'none' };

export function chatTargetOf(view: CustomerChannelsView): ChatTarget {
  const first = view.channels[0];
  if (first) return { kind: 'conversation', conversationId: first.conversationId };
  return view.canStartWhatsapp ? { kind: 'start_whatsapp' } : { kind: 'none' };
}

/** "Ekle" özeti taslağa yazar: operatör hangi siparişten söz ettiğini elle yazmasın. */
export interface MessengerContext {
  origin: string;
  summary: string;
}

/** Boş parça atlanır: özet müşteriye gidecek cümleye eklenebilir, girilmemiş bir değer uydurulmamalı. */
export function chatContext(origin: string, parts: readonly (string | null | undefined)[]): MessengerContext {
  return { origin, summary: parts.filter((part): part is string => Boolean(part?.trim())).join(' · ') };
}

/** Detay ve önizleme aynı satırı kurar: iki kopya bir gün ayrı biçimde yazardı. */
export function orderChatContext(
  origin: string,
  order: { referenceNo: string | null; totalCents: number; deliveryDate: string | null },
): MessengerContext {
  return chatContext(origin, [
    order.referenceNo ?? 'Sipariş',
    money(order.totalCents),
    order.deliveryDate ? `${shortDate(order.deliveryDate)} teslim` : null,
  ]);
}

/** Özet taslağın sonuna ayrı satırda eklenir: yazılmış cümle ezilmez. */
export function appendToDraft(draft: string, line: string): string {
  return draft.trim() ? `${draft.trimEnd()}\n${line}` : line;
}
