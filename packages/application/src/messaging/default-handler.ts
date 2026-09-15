import type { SupabaseClient } from '@supabase/supabase-js';
import { SettingsService } from '@lezzet/database';
import {
  CONVERSATION_DEFAULT_HANDLER_FALLBACK,
  CONVERSATION_DEFAULT_HANDLER_HELP,
  CONVERSATION_DEFAULT_HANDLER_KEY,
  resolveDefaultHandler,
} from '@lezzet/domain-core';
import type { TicketHandler } from '@lezzet/types';

// Bütün açılış yolları ve iki yazan yüzey aynı iki fonksiyondan geçer: anahtarı bir yerde yazıp ötekinde unutmak mümkün olmasın.
// Okuma her gelen mesajda çağrılır ama ucuzdur, `SettingsService` kısa süreli önbellek tutar.

export async function defaultConversationHandler(db: SupabaseClient): Promise<TicketHandler> {
  const raw = await new SettingsService(db).get<unknown>(CONVERSATION_DEFAULT_HANDLER_KEY, CONVERSATION_DEFAULT_HANDLER_FALLBACK);
  return resolveDefaultHandler(raw);
}

/** Açıklama sözlükle aynı cümle: satırı veritabanında gören de ne olduğunu okuyabilsin. */
export async function setDefaultConversationHandler(db: SupabaseClient, mode: TicketHandler, actorId: string | null = null): Promise<void> {
  await new SettingsService(db).set(CONVERSATION_DEFAULT_HANDLER_KEY, mode, {
    scopeType: 'global',
    description: CONVERSATION_DEFAULT_HANDLER_HELP,
    actorId,
  });
}
