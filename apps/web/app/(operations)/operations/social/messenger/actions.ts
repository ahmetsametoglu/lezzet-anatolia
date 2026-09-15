'use server';

import { CustomerInboxService, UserProfileService, serviceDb } from '@lezzet/database';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { openWhatsappConversation } from '@/lib/messaging/conversation';
import { readConversationDetailView } from '../social-detail';
import type { ConversationDetailView } from '../social-types';

// Sohbet sayfasıyla aynı kapı (`requireAdmin`): pencere bir kısayol, ikinci bir yetki yolu değil. Liste ve gönderim sayfanın
// kendi action'larından gelir ki pencere kuralı ve çeviri tek yerde kalsın.

/** Rozet cevap bekleyen kişiyi sayar, kuyrukla aynı birim; kuyruk son gelen mesaja göre sıralı, ilk satırın damgası sesin ölçütüdür. */
export async function messengerPulseAction(): Promise<ActionResult<{ awaiting: number; latestInboundAt: string | null }>> {
  try {
    await requireAdmin();
    const inbox = new CustomerInboxService(serviceDb());
    const [awaiting, top] = await Promise.all([inbox.countAwaitingReply(), inbox.list({}, undefined, 1)]);
    return { data: { awaiting, latestInboundAt: top.rows[0]?.lastInboundAt ?? null }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

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
 * E-posta ikinci anahtar olarak geçer ki sohbet bu müşteriye bağlansın; Messenger/Instagram'da bu yol yok, işletme orada
 * sohbet başlatamaz. İlk mesaj yine Meta kuralına tabi: son 24 saatte yazmamış müşteriye yalnız onaylı kalıp gider.
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
