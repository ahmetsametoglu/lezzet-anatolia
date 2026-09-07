import type { SupabaseClient } from '@supabase/supabase-js';
import { SettingsService } from '@lezzet/database';
import {
  CONVERSATION_DEFAULT_HANDLER_FALLBACK,
  CONVERSATION_DEFAULT_HANDLER_HELP,
  CONVERSATION_DEFAULT_HANDLER_KEY,
  resolveDefaultHandler,
} from '@lezzet/domain-core';
import type { TicketHandler } from '@lezzet/types';

/*
  YENİ SOHBETİN VARSAYILAN YÜRÜTÜCÜSÜ — okuma ve yazma kapısı (15.30). Karar motorda
  (`resolveDefaultHandler`), satır `settings`te; burası ikisini bağlar. Üç açılış yolu (WhatsApp
  webhook · Messenger/IG webhook · elle işlenen DM) ve iki yazan yüzey (Ayarlar · Sosyal Mesajlar)
  aynı iki fonksiyondan geçer — anahtarı bir yerde `'ai'` diye yazıp ötekinde unutmak mümkün olmasın.

  Okuma her gelen mesajda çağrılır ama pahalı değil: `SettingsService` süreç içinde kısa süreli
  önbellek tutuyor (`rowsFor`), yazma o önbelleği düşürüyor.
*/

/** Yeni açılan sohbetin modu — ayar satırından, bozuksa fabrika değerinden. */
export async function defaultConversationHandler(db: SupabaseClient): Promise<TicketHandler> {
  const raw = await new SettingsService(db).get<unknown>(CONVERSATION_DEFAULT_HANDLER_KEY, CONVERSATION_DEFAULT_HANDLER_FALLBACK);
  return resolveDefaultHandler(raw);
}

/**
 * Varsayılanı yazar — genel (global) satıra. Açık sohbetlere DOKUNMAZ (künye motorda).
 * Açıklama sözlükle aynı cümle: satırı veritabanında gören de ne olduğunu okuyabilsin.
 */
export async function setDefaultConversationHandler(db: SupabaseClient, mode: TicketHandler, actorId: string | null = null): Promise<void> {
  await new SettingsService(db).set(CONVERSATION_DEFAULT_HANDLER_KEY, mode, {
    scopeType: 'global',
    description: CONVERSATION_DEFAULT_HANDLER_HELP,
    actorId,
  });
}
