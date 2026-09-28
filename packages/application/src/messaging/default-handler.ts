import type { SupabaseClient } from '@supabase/supabase-js';
import { SettingsService } from '@lezzet/database';
import {
  CONVERSATION_DEFAULT_HANDLER_FALLBACK,
  CONVERSATION_DEFAULT_HANDLER_HELP,
  CONVERSATION_DEFAULT_HANDLER_KEY,
  TICKET_DEFAULT_HANDLER_FALLBACK,
  TICKET_DEFAULT_HANDLER_HELP,
  TICKET_DEFAULT_HANDLER_KEY,
  resolveDefaultHandler,
} from '@lezzet/domain-core';
import type { TicketHandler } from '@lezzet/types';

// Bütün açılış yolları ve iki yazan yüzey aynı fonksiyonlardan geçer: anahtarı bir yerde yazıp ötekinde unutmak mümkün olmasın.
// Okuma her açılışta çağrılır ama ucuzdur, `SettingsService` kısa süreli önbellek tutar.

interface HandlerSetting {
  key: string;
  fallback: TicketHandler;
  help: string;
}

const CONVERSATION: HandlerSetting = {
  key: CONVERSATION_DEFAULT_HANDLER_KEY,
  fallback: CONVERSATION_DEFAULT_HANDLER_FALLBACK,
  help: CONVERSATION_DEFAULT_HANDLER_HELP,
};

const TICKET: HandlerSetting = {
  key: TICKET_DEFAULT_HANDLER_KEY,
  fallback: TICKET_DEFAULT_HANDLER_FALLBACK,
  help: TICKET_DEFAULT_HANDLER_HELP,
};

async function readHandler(db: SupabaseClient, setting: HandlerSetting): Promise<TicketHandler> {
  const raw = await new SettingsService(db).get<unknown>(setting.key, setting.fallback);
  return resolveDefaultHandler(raw, setting.fallback);
}

/** Açıklama sözlükle aynı cümle: satırı veritabanında gören de ne olduğunu okuyabilsin. */
async function writeHandler(db: SupabaseClient, setting: HandlerSetting, mode: TicketHandler, actorId: string | null): Promise<void> {
  await new SettingsService(db).set(setting.key, mode, { scopeType: 'global', description: setting.help, actorId });
}

export function defaultConversationHandler(db: SupabaseClient): Promise<TicketHandler> {
  return readHandler(db, CONVERSATION);
}

export function setDefaultConversationHandler(db: SupabaseClient, mode: TicketHandler, actorId: string | null = null): Promise<void> {
  return writeHandler(db, CONVERSATION, mode, actorId);
}

export function defaultTicketHandler(db: SupabaseClient): Promise<TicketHandler> {
  return readHandler(db, TICKET);
}

export function setDefaultTicketHandler(db: SupabaseClient, mode: TicketHandler, actorId: string | null = null): Promise<void> {
  return writeHandler(db, TICKET, mode, actorId);
}
