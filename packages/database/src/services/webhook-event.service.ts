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
 * Dış sağlayıcı olayları (07.5). Tek işi **aynı olayın iki kez işlenmesini engellemek**.
 */
export class WebhookEventService extends BaseDbService<WebhookEvent, WebhookEventInsert, WebhookEventUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'webhook_event', WebhookEventSchema, WebhookEventInsertSchema, WebhookEventUpdateSchema);
  }

  /**
   * Olayı **sahiplen**: ilk gelişte satır yazılır ve `fresh:true` döner, tekrarında yazım
   * benzersizlik kısıtına takılır ve `fresh:false` döner.
   *
   * Kontrol ile yazım TEK ifadede olmalı — "önce sorgula, yoksa yaz" arasında ikinci webhook
   * girerse iki işleyici birden "yeni" der ve tahsilat iki kez yazılır. `ignoreDuplicates` bunu
   * veritabanına havale eder: yarışın kazananı bir tanedir.
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
}
