import 'server-only';
import { anchorOf } from '@lezzet/application';
import { CustomerInboxService, serviceDb } from '@lezzet/database';
import { TICKET_STATUS_LABELS } from '@lezzet/types';
import { readCustomerContext } from '@/lib/customer/context';
import { readConversationDetail } from '@/lib/messaging/read';
import { consentStateOf, tabsOf, titleOf, toThreadItems, toWindowView } from './social-read';
import type { ConversationDetailView } from './social-types';

/**
 * Sohbet sayfası ile yüzen mesaj penceresinin ortak okuması: iki kopya bir gün ayrışır, pencerede "kapalı" yazan sohbet sayfada
 * "açık" okunurdu. `now` dışarıdan gelir ki kuyruk rozetleri ile sohbet altlığı aynı ana göre hesaplansın.
 */
export async function readConversationDetailView(conversationId: string, now: Date): Promise<ConversationDetailView | null> {
  const detail = await readConversationDetail(conversationId);
  if (!detail) return null;

  const customerId = detail.conversation.customerId;
  // Çapa müşterinin künyesidir, konuşmanın değil: kimliksiz sohbette sorulacak bir şey yok.
  const [context, anchor, person] = await Promise.all([
    customerId ? readCustomerContext(customerId) : null,
    customerId ? anchorOf(serviceDb(), customerId) : null,
    // Kimliksiz sohbette kişi sohbetin kendisidir.
    new CustomerInboxService(serviceDb()).rowOf(customerId ?? detail.conversation.id),
  ]);

  return {
    id: detail.conversation.id,
    source: detail.conversation.source,
    title: context?.name.trim() || titleOf({ profileName: detail.conversation.profileName, externalRef: detail.conversation.externalRef }),
    externalRef: detail.conversation.externalRef,
    profileName: detail.conversation.profileName,
    window: toWindowView(detail.conversation.windowExpiresAt, now, detail.conversation.source),
    // Hedef dil gönderim kapısıyla aynı karardan gelir; ekran hesaplamaz.
    language: detail.language,
    thread: toThreadItems(detail.messages, detail.notes),
    messageCount: detail.messages.length,
    threads: tabsOf(person?.threads ?? [], {
      id: detail.conversation.id,
      source: detail.conversation.source,
      messageCount: detail.messages.length,
      awaitingReply: false,
    }),
    context,
    tickets: detail.tickets.map((t) => ({
      id: t.id,
      subject: t.subject?.trim() || 'Başlıksız talep',
      statusLabel: TICKET_STATUS_LABELS[t.status],
    })),
    handledBy: detail.conversation.handledBy,
    aiDraft: detail.conversation.aiDraftReply,
    consent: consentStateOf({
      source: detail.conversation.source,
      customerConsent: context?.whatsappConsent ?? null,
      optIn: detail.conversation.optIn,
      optInAskedAt: detail.conversation.optInAskedAt,
    }),
    anchor,
  };
}
