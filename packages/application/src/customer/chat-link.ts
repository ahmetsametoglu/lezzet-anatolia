import { ConversationService } from '@lezzet/database';
import { logger } from '@lezzet/observability';
import type { Conversation } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { claimLinkToken } from './whatsapp-link';

export type ConsumeChatLinkOutcome =
  | { status: 'none' }
  | { status: 'invalid' }
  | { status: 'linked'; customerId: string }
  /** Sohbet zaten bu hesaba bağlıydı. */
  | { status: 'own'; customerId: string }
  /** Sohbet başka bir hesaba bağlı; bağı kaydırmak birleştirme kararıdır ve insana kalır. */
  | { status: 'foreign'; customerId: string };

/**
 * Messenger/Instagram mesajındaki bağlama kodunu tüketir ve sohbeti koda sahip hesaba bağlar. Kanıt iki katlı: hesap sahibi kodu
 * oturumunda aldı, sohbetin sahibi onu kendi sohbetinden gönderdi.
 */
export async function consumeChatLink(
  db: SupabaseClient,
  conversation: Pick<Conversation, 'id' | 'customerId'>,
  text: string | null,
): Promise<ConsumeChatLinkOutcome> {
  const claim = await claimLinkToken(db, text);
  if (claim.status !== 'ok') return claim;

  if (conversation.customerId === claim.accountId) return { status: 'own', customerId: claim.accountId };
  if (conversation.customerId) {
    logger.warn({ context: 'customer/chat-link', conversationId: conversation.id }, 'sohbet başka bir hesaba bağlı — kod bağ kurmadı');
    return { status: 'foreign', customerId: claim.accountId };
  }

  // Koşullu yazım: bu sırada operatör bağladıysa dolu bağ ezilmez.
  const linked = await new ConversationService(db).linkCustomer(conversation.id, {
    customerId: claim.accountId,
    linkedBy: null,
    proof: 'chat_code',
  });
  return linked ? { status: 'linked', customerId: claim.accountId } : { status: 'foreign', customerId: claim.accountId };
}
