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

/**
 * İşleyicinin kirası Revolut'un 10 dakikalık yeniden gönderim aralığından kısadır: işlerken kapanan sürecin olayını ilk tekrar yeniden
 * alır. En uzun işleme, aktarım raporunun en çok 30 saniyelik beklemesidir.
 */
const CLAIM_LEASE_SECONDS = 5 * 60;

/** Dış sağlayıcı olayları: aynı olayın iki kez işlenmesini engeller. */
export class WebhookEventService extends BaseDbService<WebhookEvent, WebhookEventInsert, WebhookEventUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'webhook_event', WebhookEventSchema, WebhookEventInsertSchema, WebhookEventUpdateSchema);
  }

  /**
   * Karar veritabanında tek ifadededir (`claim_webhook_event`): "önce sorgula, yoksa yaz" arasında ikinci bildirim girerse iki işleyici
   * birden "yeni" der ve tahsilat iki kez yazılırdı. Düşmüş ya da kirası dolmuş olayın tekrarı yeniden alınır, yoksa sağlayıcının
   * yeniden denemesi olayı kaybettirirdi; işlenmiş ya da kirası süren olayın tekrarı alınmaz.
   */
  async claim(input: WebhookEventInsert): Promise<{ fresh: boolean; event: WebhookEvent }> {
    const valid = this.insertSchema.parse(input);
    const { data, error } = await this.supabase.rpc('claim_webhook_event', {
      p_provider: valid.provider,
      p_event_id: valid.eventId,
      p_type: valid.type,
      p_payload: valid.payload ?? null,
      p_lease_seconds: CLAIM_LEASE_SECONDS,
    });
    if (error) throw error;
    const result = data as { fresh: boolean; event: unknown };
    const [event] = this.parseRows([result.event]);
    if (!event) throw new Error(`webhook_event: olay sahiplenilemedi (${valid.provider}/${valid.eventId})`);
    return { fresh: result.fresh, event };
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
