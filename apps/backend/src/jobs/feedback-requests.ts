import { FeedbackDueOrderService, FeedbackRequestService, SettingsService, serviceDb } from '@lezzet/database';
import { FEEDBACK_DELAY_DAYS, feedbackToken, isDueForFeedback } from '@lezzet/domain-core';
import type { FeedbackChannel, FeedbackRequest } from '@lezzet/types';

export const CREATE_FEEDBACK_REQUESTS = 'create_feedback_requests';

/**
 * Alım-sonrası geri bildirim daveti taraması (DOMAIN §14): saatin tetiklediği iş olduğu için `apps/backend`'dedir, müşteri yüzeyi daveti
 * açar ve tamamlar ama oluşturmaz. Kaynak `feedback_due_order` görünümüdür, çünkü daveti olanlar sorgu penceresini doldurursa yeni
 * siparişe sıra gelmezdi; tarama idempotenttir ve sipariş başına tek davet indeksle de zorlanır.
 */
export async function createDueFeedbackRequests(opts: { channel?: FeedbackChannel; limit?: number } = {}): Promise<FeedbackRequest[]> {
  const db = serviceDb();
  const requests = new FeedbackRequestService(db);

  const delayDays = await new SettingsService(db).getNumber('feedback_delay_days', FEEDBACK_DELAY_DAYS);
  const candidates = await new FeedbackDueOrderService(db).listDue(opts.limit ?? 200);
  const created: FeedbackRequest[] = [];

  for (const candidate of candidates) {
    // "Zamanı geldi mi" kararı motorun; `feedback_delay_days` parametrik.
    if (!isDueForFeedback({ status: candidate.status, deliveredAt: candidate.deliveredAt, delayDays })) continue;

    created.push(
      await requests.insert({
        orderId: candidate.orderId,
        customerId: candidate.customerId,
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

// Gönderim ayrı iştir (`send-feedback-invites.ts`): sağlayıcı düştüğünde davet kaybolmasın diye oluşturma ile gönderim ayrıdır.
