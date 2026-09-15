import 'server-only';
import { anchorOf } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { TICKET_STATUS_LABELS } from '@lezzet/types';
import { readCustomerContext } from '@/lib/customer/context';
import { readConversationDetail } from '@/lib/messaging/read';
import { consentStateOf, titleOf, toThreadItems, toWindowView } from './social-read';
import type { ConversationDetailView } from './social-types';

/**
 * Sohbet DETAYININ ekran görünümü — sohbet sayfasının ve yüzen mesaj penceresinin (15.32) ORTAK okuması.
 *
 * Sayfanın içindeydi; pencere aynı sohbeti açınca ikinci bir kopya doğacaktı ve iki kopya bir gün ayrışır —
 * pencerede "kapalı" yazan pencere sayfada "açık" okunurdu.
 *
 * `now` DIŞARIDAN: sayfa kuyruk rozetleriyle aynı anı kullanır — ikisi ayrı okunsaydı aynı konuşma listede
 * "2 dk" derken altlıkta "kapalı" diyebilirdi.
 */
export async function readConversationDetailView(conversationId: string, now: Date): Promise<ConversationDetailView | null> {
  const detail = await readConversationDetail(conversationId);
  if (!detail) return null;

  const customerId = detail.conversation.customerId;
  // Müşteri bağlamı ORTAK okumadan (`lib/customer/context`) — Talepler ekranı da aynısını okuyor. Çapa
  // MÜŞTERİNİN künyesi, konuşmanın değil (04.10) — kimliksiz sohbette sorulacak bir şey yok.
  const [context, anchor] = customerId
    ? await Promise.all([readCustomerContext(customerId), anchorOf(serviceDb(), customerId)])
    : [null, null];

  return {
    id: detail.conversation.id,
    source: detail.conversation.source,
    title: context?.name.trim() || titleOf({ profileName: detail.conversation.profileName, externalRef: detail.conversation.externalRef }),
    externalRef: detail.conversation.externalRef,
    profileName: detail.conversation.profileName,
    window: toWindowView(detail.conversation.windowExpiresAt, now, detail.conversation.source),
    // Hedef dil okuma kapısından, gönderim kapısıyla aynı karar (15.28) — ekran hesaplamaz.
    language: detail.language,
    // Mesajlar + iç notlar tek akışta (15.29); başlıktaki sayı yalnız mesajları sayar.
    thread: toThreadItems(detail.messages, detail.notes),
    messageCount: detail.messages.length,
    context,
    tickets: detail.tickets.map((t) => ({
      id: t.id,
      subject: t.subject?.trim() || 'Başlıksız talep',
      statusLabel: TICKET_STATUS_LABELS[t.status],
    })),
    handledBy: detail.conversation.handledBy,
    aiDraft: detail.conversation.aiDraftReply,
    // Kampanya izni ÜÇ hâlli (14.09) — "sorulmadı" ile "reddetti" ayrı; kaynağı kanala göre ayrı.
    consent: consentStateOf({
      source: detail.conversation.source,
      customerConsent: context?.whatsappConsent ?? null,
      optIn: detail.conversation.optIn,
      optInAskedAt: detail.conversation.optInAskedAt,
    }),
    anchor,
  };
}
