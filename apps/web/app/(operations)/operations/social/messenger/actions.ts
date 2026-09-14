'use server';

import { ConversationInboxService, UserProfileService, serviceDb } from '@lezzet/database';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { openWhatsappConversation } from '@/lib/messaging/conversation';
import { readConversationDetailView } from '../social-detail';
import type { ConversationDetailView } from '../social-types';

// YÜZEN MESAJ PENCERESİNİN kapıları (15.32) — sohbet sayfasıyla AYNI okumalar, AYNI kapı (`requireAdmin`):
// pencere bir kısayol, ikinci bir yetki yolu değil. Liste sayfası ve gönderim sayfanın kendi kapılarından
// (`loadMoreConversationsAction` · `sendOutboundAction`) — pencere kuralı ve çeviri tek yerde kalsın.
// Müşterinin kanal düğmesinin kapısı ortak (`lib/messaging/customer-channel-actions`): düğmeyi başka
// sayfalar çiziyor.

/** Düğmenin rozeti — cevap bekleyen sohbet SAYIMI (kuyruk başlığının aynı sayısı, sayfa uzunluğu değil). */
export async function messengerAwaitingCountAction(): Promise<ActionResult<number>> {
  try {
    await requireAdmin();
    return { data: await new ConversationInboxService(serviceDb()).countAwaitingReply(), error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Tek sohbet — sayfanın detayıyla AYNI görünüm (`readConversationDetailView`). */
export async function messengerConversationAction(conversationId: string): Promise<ActionResult<ConversationDetailView>> {
  try {
    await requireAdmin();
    const view = await readConversationDetailView(conversationId, new Date());
    if (!view) return { data: null, error: 'Sohbet bulunamadı.' };
    return { data: view, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * **WhatsApp sohbetini aç** — müşteri bize WhatsApp'tan hiç yazmamışsa, kayıtlı numarasıyla
 * (`openWhatsappConversation`; e-posta ikinci anahtar olarak geçer ki sohbet bu müşteriye bağlansın).
 * Messenger/Instagram'da bu yol YOK: işletme orada sohbet başlatamaz.
 *
 * İlk mesaj yine Meta kuralına tabi: müşteri son 24 saatte yazmadıysa WhatsApp'a yalnız onaylı kalıp
 * mesaj gider. Pencere bunu kapalı pencere bandıyla söyler (`WINDOW_NOTE`); kapı burada bir şey vaat etmez.
 */
export async function startWhatsappConversationAction(customerId: string): Promise<ActionResult<{ conversationId: string }>> {
  try {
    await requireAdmin();
    const profile = await new UserProfileService(serviceDb()).getById(customerId);
    if (!profile) return { data: null, error: 'Müşteri bulunamadı.' };
    if (!profile.phone) return { data: null, error: 'Müşterinin telefonu kayıtlı değil — WhatsApp sohbeti açılamadı.' };

    const opened = await openWhatsappConversation({ phone: profile.phone, name: profile.name, email: profile.email });
    if (opened.status === 'invalid_phone') {
      return { data: null, error: 'Müşterinin kayıtlı telefonu okunamadı — kaydı ülke koduyla düzeltin.' };
    }
    if (opened.status === 'conflict') {
      return {
        data: null,
        error: 'Bu numara ile e-posta ayrı müşterilere ait. Sohbet açılmadı — önce Müşteriler ekranından kayıtları birleştirin.',
      };
    }
    return { data: { conversationId: opened.conversation.id }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
