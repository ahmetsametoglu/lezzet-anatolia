import { resolveOutboundLanguage } from '@lezzet/application';
import { ConversationNoteService, ConversationService, MessageService, TicketService, serviceDb } from '@lezzet/database';
import type { OutboundLanguage } from '@lezzet/domain-core';
import type { Conversation, ConversationNote, Message, Ticket } from '@lezzet/types';

// Müşteri bağlamı burada okunmaz (`lib/customer/context`): Talepler ekranı da aynı soruyu sorar ve cevap tek yerde durmalı.

/** Adres imzalı R2 bağlantısı değil, kendi geçidimiz (`media/[id]/route`): imza tarayıcının dosyayı istediği ana ait olmalı. */
export interface MessageWithMedia extends Message {
  /** `null`: mesajın medyası yok ya da indirme düşmüş. */
  mediaUrl: string | null;
}

const MEDIA_GATE = '/operations/social/media';

interface ConversationDetailData {
  conversation: Conversation;
  messages: MessageWithMedia[];
  notes: ConversationNote[];
  tickets: Ticket[];
  /** Gönderim kapısıyla aynı karardan (`resolveOutboundLanguage`): ekran kendi hesaplasaydı "Fransızca" okurken mesaj Almanca gidebilirdi. */
  language: OutboundLanguage;
}

/**
 * Mesaj geçmişi tamamıyla okunur: var olan sayfalı okuma (`MessageService.listPage`) artan yönde, sohbet ise en yenisiyle açılıp
 * geriye okur. BEKLEYEN(15.7): ters yönlü sayfalı okuma.
 */
export async function readConversationDetail(conversationId: string): Promise<ConversationDetailData | null> {
  const db = serviceDb();
  const conversation = await new ConversationService(db).getById(conversationId);
  if (!conversation) return null;

  // Mesajlar, iç notlar ve talepler konuşmaya bağlı: müşteri çözülmese de okunur.
  const [messages, notes, tickets, language] = await Promise.all([
    new MessageService(db).listByConversation(conversationId),
    new ConversationNoteService(db).listByConversation(conversationId),
    new TicketService(db).listByConversation(conversationId),
    resolveOutboundLanguage(db, conversation),
  ]);

  return {
    conversation,
    messages: messages.map((m) => ({ ...m, mediaUrl: m.mediaKey ? `${MEDIA_GATE}/${m.id}` : null })),
    notes,
    tickets,
    language,
  };
}
