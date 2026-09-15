import { ConversationService } from '@lezzet/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import { updateCustomerPreferences } from '../customer/preferences';

// Kural action'da değil pakette: orada sınanamazdı ve native izin ucu ikinci bir kopya doğururdu.

export type ConversationOptInOutcome =
  | { status: 'recorded'; profileUpdated: boolean }
  | { status: 'refused'; reason: 'conversation_not_found' };

/**
 * Sohbetin izni ile müşterinin izni ayrı soruları cevaplar: kimliksiz sohbette de izin kaydedilmeli, müşterinin izni kampanyanın
 * dayanağıdır. Müşteri kaydına yalnız WhatsApp yazılır: kaydın Messenger/Instagram kutusu yok, olmayan kanala yazmak dayanaksız izin üretirdi.
 */
export async function recordConversationOptIn(
  db: SupabaseClient,
  input: { conversationId: string; granted: boolean },
): Promise<ConversationOptInOutcome> {
  const service = new ConversationService(db);
  const conversation = await service.getById(input.conversationId);
  if (!conversation) return { status: 'refused', reason: 'conversation_not_found' };

  // Sohbetin izni her kanalda yazılır: izin kanaldan bağımsız olarak sohbette verilmiştir.
  await service.setOptIn(input.conversationId, input.granted);

  const kartaYazilir = conversation.source === 'whatsapp' && conversation.customerId !== null;
  if (kartaYazilir) {
    // `source` iznin nereden geldiğidir: hesap sayfasından verilenle sohbette verilen ayırt edilebilmeli.
    await updateCustomerPreferences(db, {
      profileId: conversation.customerId!,
      source: 'whatsapp',
      marketingConsent: { whatsapp: input.granted },
    });
  }

  return { status: 'recorded', profileUpdated: kartaYazilir };
}
