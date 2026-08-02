import { FeedbackDueOrderService, FeedbackRequestService, SettingsService, serviceDb } from '@lezzet/database';
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
 * **Kaynak `feedback_due_order` görünümüdür, `order` tablosu DEĞİL** — ve bu bir başarım tercihi
 * değil, doğruluk şartı. İş önce teslim edilmiş ilk N siparişi çekip her biri için "daveti var mı"
 * diye soruyordu: davet edilmişler pencereyi doldurunca yeni siparişlere sıra GELMİYORDU. Sessizdi
 * de — iş başarılı biter, ize `{created: 0}` yazar, hiçbir alarm çalmaz. Süzgeç kaynağa taşındığında
 * pencere yalnız gerçek adaylarla dolar; sipariş başına iki sorgu da (davet var mı + teslim anı)
 * tek turda çözülür.
 *
 * Teslim anı `order_status_log`'dan TÜRETİLİR (görünümün içinde); siparişte `delivered_at` diye bir
 * kolon yok ve olmamalı (DATA_MODEL türetme ilkesi).
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

// Gönderim İKİNCİ bir iştir ve kendi dosyasındadır (`send-feedback-invites.ts`): sağlayıcı
// düştüğünde davet kaybolmasın diye oluşturma ile gönderim ayrıdır. Burada duran iki sarmalayıcı
// (`listPendingInvites` / `markInviteSent`) o işin YERİNİ TUTUYORDU — kuyruğu okuyup damgalamayı
// biliyorlardı ama hiçbir yerden çağrılmıyorlardı; kuyruk doluyor, kimse boşaltmıyordu. Gerçek iş
// gelince yer tutucuya gerek kalmadı.
