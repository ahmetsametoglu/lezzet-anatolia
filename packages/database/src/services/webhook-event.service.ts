import type { SupabaseClient } from '@supabase/supabase-js';
import {
  WebhookEventSchema,
  WebhookEventInsertSchema,
  WebhookEventUpdateSchema,
  type WebhookEvent,
  type WebhookEventInsert,
  type WebhookEventUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/** Dış sağlayıcı olayları: aynı olayın iki kez işlenmesini engeller. */
export class WebhookEventService extends BaseDbService<WebhookEvent, WebhookEventInsert, WebhookEventUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'webhook_event', WebhookEventSchema, WebhookEventInsertSchema, WebhookEventUpdateSchema);
  }

  /**
   * Kontrol ile yazım tek ifadede: "önce sorgula, yoksa yaz" arasında ikinci webhook girerse iki işleyici birden "yeni" der ve
   * tahsilat iki kez yazılır.
   */
  async claim(input: WebhookEventInsert): Promise<{ fresh: boolean; event: WebhookEvent }> {
    const inserted = await this.bulkUpsertIgnoring([input], 'provider,event_id');
    if (inserted[0]) return { fresh: true, event: inserted[0] };

    const existing = await this.getOneBy({ provider: input.provider, eventId: input.eventId });
    if (!existing) throw new Error(`webhook_event: olay sahiplenilemedi (${input.provider}/${input.eventId})`);
    return { fresh: false, event: existing };
  }

  /** İşlem bitti damgası — "geldi ama işlenemedi" ile "işlendi" ayrımını korur. */
  markProcessed(id: string): Promise<WebhookEvent> {
    return this.update({ id, processedAt: new Date().toISOString(), error: null });
  }

  /** İşleme düştü: damga atılmaz, sebep yazılır — tekrar denemede neyin takıldığı görünür. */
  markFailed(id: string, error: string): Promise<WebhookEvent> {
    return this.update({ id, error });
  }

  /** Satır kalır, içerik gider: satır silinseydi sağlayıcının geç gelen tekrarı olayı yeniden işlerdi. */
  async clearPayload(provider: string, eventId: string): Promise<void> {
    const event = await this.getOneBy({ provider, eventId });
    if (event) await this.update({ id: event.id, payload: null });
  }
}
