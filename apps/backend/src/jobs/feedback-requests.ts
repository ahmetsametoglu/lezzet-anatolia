import { FeedbackRequestService, OrderService, OrderStatusLogService, SettingsService, serviceDb } from '@lezzet/database';
import { FEEDBACK_DELAY_DAYS, feedbackToken, isDueForFeedback } from '@lezzet/domain-core';
import type { FeedbackChannel, FeedbackRequest } from '@lezzet/types';

export const CREATE_FEEDBACK_REQUESTS = 'create_feedback_requests';

/**
 * Alım-sonrası geri bildirim daveti taraması (17.2) — DOMAIN §14.
 *
 * **Neden `apps/web` değil burada:** bu bir isteğin değil, saatin tetiklediği iş. Web tarafında
 * dursaydı onu çağıracak bir HTTP ucu ve o ucu koruyacak bir sır gerekirdi — sırf zamanlayıcı
 * oraya erişebilsin diye. Zamanlanmış işin evi `apps/backend` (STACK §13 cron disiplini); iki
 * uygulamanın da gördüğü ortak parçalar zaten paketlerde (`domain-core` kuralı, `database` I/O'yu
 * verir). Müşteri yüzeyi daveti **açar ve tamamlar**, oluşturmaz.
 *
 * **Taramalı ve idempotent:** "bugün teslim edilenler" değil, "daveti hak eden TÜM siparişler"
 * gezilir; zaten daveti olan atlanır (sipariş başına tek davet DB indeksiyle de zorlanır). Kaçan
 * bir tik ertesi taramada telafi olur, ikinci tarama no-op'tur.
 *
 * Teslim anı `order_status_log`'dan TÜRETİLİR; siparişte `delivered_at` diye bir kolon yok ve
 * olmamalı (DATA_MODEL türetme ilkesi).
 */
export async function createDueFeedbackRequests(opts: { channel?: FeedbackChannel; limit?: number } = {}): Promise<FeedbackRequest[]> {
  const db = serviceDb();
  const orders = new OrderService(db);
  const logs = new OrderStatusLogService(db);
  const requests = new FeedbackRequestService(db);

  const delayDays = await new SettingsService(db).getNumber('feedback_delay_days', FEEDBACK_DELAY_DAYS);
  const candidates = await orders.listByStatus(['delivered', 'completed'], { limit: opts.limit ?? 200 });
  const created: FeedbackRequest[] = [];

  for (const order of candidates) {
    if (await requests.findByOrder(order.id)) continue; // zaten davet edilmiş
    const deliveredAt = await logs.firstEntryAt(order.id, 'delivered');
    if (!isDueForFeedback({ status: order.status, deliveredAt, delayDays })) continue;

    created.push(
      await requests.insert({
        orderId: order.id,
        customerId: order.customerId,
        token: feedbackToken(),
        channel: opts.channel ?? 'email',
      }),
    );
  }
  return created;
}

/** Cron kabuğunun (`runJob`) çağırdığı sarmalayıcı — ize yazılacak özeti döner. */
export async function createFeedbackRequestsJob(): Promise<Record<string, unknown>> {
  return { created: (await createDueFeedbackRequests()).length };
}

/**
 * Gönderilmeyi bekleyen davetler — bildirim katmanı (14) bunları alıp yollar ve damgalar.
 *
 * **Oluşturma ile gönderim ayrı adımlar:** e-posta sağlayıcısı düştüğünde davet kaybolmaz,
 * `sent_at` boş olarak kuyrukta kalır ve bir sonraki tur onu bulur. Tek adım olsaydı sağlayıcı
 * hatası daveti hiç var olmamış yapardı.
 *
 * BEKLEYEN(14.3): gönderim işinin kendisi — şablon ve kanal bildirim modülüyle gelir.
 */
export function listPendingInvites(limit?: number): Promise<FeedbackRequest[]> {
  return new FeedbackRequestService(serviceDb()).listUnsent(limit);
}

export function markInviteSent(id: string): Promise<FeedbackRequest> {
  return new FeedbackRequestService(serviceDb()).markSent(id);
}
