import { MoneyMovementService, WebhookEventService } from '@lezzet/database';
import { parsePayoutStatement, payoutPaymentFees, unexplainedPayoutRows } from '@lezzet/domain-core';
import { captureError, SOURCES } from '@lezzet/observability';
import { RevolutApiPayoutListSchema, RevolutReportRunSchema, type RevolutApiPayout, type RevolutReportRun } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyPayoutUnexplained } from '../notification/staff-events';
import { recordPaymentFee } from './payment-fee';
import { RevolutError, type RevolutClient } from './revolut';

/**
 * Kart komisyonu ödeme anında çoğu zaman boştur ve aktarımın raporunda kesinleşir: Revolut merchant hesabından ana hesaba aktarım
 * yapınca rapor her işlemin komisyonunu ve aktarıma katkısını verir. Komisyon buradan siparişe yazılır; defterin açıklayamadığı satır
 * yönetime bildirilir.
 */

/** Rapor üretilirken bakış sayısı ve aralığı; süre aşılırsa hata fırlar ve sonraki tur aynı aktarımı yeniden dener. */
const REPORT_POLL = { attempts: 10, waitMs: 3_000 };

/** Geriye okuma penceresi: raporu düşen ya da bildirimi kaçan aktarım sonraki turlarda yakalanır. */
const LOOKBACK_DAYS = 14;

/** İşlenmiş aktarımın izi; sağlayıcı olaylarıyla aynı tabloda, çünkü "bir kez işle" kapısı oradadır. */
const statementEventId = (payoutId: string): string => `payout-statement:${payoutId}`;

/** Tamamlanmış aktarımlar; iki haftalık pencerede tek sayfa (100 kayıt) yeter. */
export async function listCompletedPayouts(client: RevolutClient, fromIso: string): Promise<RevolutApiPayout[]> {
  const query = new URLSearchParams({ state: 'completed', from_created_date: fromIso, limit: '100' });
  const parsed = RevolutApiPayoutListSchema.safeParse(await client.request('GET', `/api/payouts?${query.toString()}`));
  if (!parsed.success) throw new RevolutError('parse', `Revolut aktarım listesi beklenen biçimde değil: ${parsed.error.message}`);
  return parsed.data;
}

function reportRunOf(response: unknown): RevolutReportRun {
  const parsed = RevolutReportRunSchema.safeParse(response);
  if (!parsed.success) throw new RevolutError('parse', `Revolut rapor kaydı beklenen biçimde değil: ${parsed.error.message}`);
  return parsed.data;
}

/** Aktarımın raporunu üretir ve CSV metnini döner. */
export async function fetchPayoutStatement(client: RevolutClient, payoutId: string, poll = REPORT_POLL): Promise<string> {
  const created = reportRunOf(
    await client.request('POST', '/api/report-runs', { type: 'payout_statement_report', format: 'csv', filter: { payout_id: payoutId } }),
  );
  const path = `/api/report-runs/${encodeURIComponent(created.report_run_id)}`;
  let run = created;
  for (let attempt = 0; run.status === 'processing' && attempt < poll.attempts; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, poll.waitMs));
    run = reportRunOf(await client.request('GET', path));
  }
  if (run.status !== 'completed') throw new RevolutError('provider', `aktarım raporu hazır değil (${run.status}): ${payoutId}`);

  const file = await client.request('GET', `${path}/file`, undefined, { accept: 'text/csv' });
  if (file === null) return '';
  if (typeof file !== 'string') throw new RevolutError('parse', `aktarım raporu metin olarak gelmedi: ${payoutId}`);
  return file;
}

/** Tek aktarımın raporu: komisyonlar siparişe yazılır, açıklanamayan satırlar yönetime bildirilir; yeniden okuma ikinci satır yazmaz. */
export async function reconcilePayoutStatement(
  db: SupabaseClient,
  client: RevolutClient,
  payoutId: string,
): Promise<{ feesWritten: number; unexplained: number }> {
  const rows = parsePayoutStatement(await fetchPayoutStatement(client, payoutId));
  const refs = [...new Set(rows.flatMap((row) => [row.orderId, row.originalOrderId]).filter((ref): ref is string => ref !== null))];
  const payments = new Map(
    (await new MoneyMovementService(db).listOrderMovementsByProviderRefs(refs)).map((movement) => [movement.providerRef, movement]),
  );

  let feesWritten = 0;
  for (const fee of payoutPaymentFees(rows)) {
    const payment = payments.get(fee.paymentRef);
    if (!payment) continue;
    const written = await recordPaymentFee(db, {
      orderId: payment.orderId,
      accountId: payment.accountId,
      paymentRef: fee.paymentRef,
      feeCents: fee.feeCents,
      meta: { payoutId },
    });
    if (written) feesWritten += 1;
  }

  const unexplained = unexplainedPayoutRows(rows, new Set(payments.keys()));
  if (unexplained.length > 0) {
    await notifyPayoutUnexplained(db, {
      payoutId,
      rowCount: unexplained.length,
      amountCents: unexplained.reduce((sum, row) => sum + row.settlementCents, 0),
    });
  }
  return { feesWritten, unexplained: unexplained.length };
}

/** Son iki haftanın tamamlanmış aktarımları; her aktarım bir kez işlenir, düşen aktarım sonraki turda yeniden alınır. */
export async function reconcileRecentPayouts(db: SupabaseClient, client: RevolutClient, now = new Date()): Promise<Record<string, number>> {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const events = new WebhookEventService(db);
  const totals = { payouts: 0, failed: 0, feesWritten: 0, unexplained: 0 };

  for (const payout of await listCompletedPayouts(client, since)) {
    const claim = await events.claim({
      provider: 'revolut',
      eventId: statementEventId(payout.id),
      type: 'payout_statement',
      payload: null,
    });
    if (!claim.fresh) continue;
    try {
      const outcome = await reconcilePayoutStatement(db, client, payout.id);
      await events.markProcessed(claim.event.id);
      totals.payouts += 1;
      totals.feesWritten += outcome.feesWritten;
      totals.unexplained += outcome.unexplained;
    } catch (error) {
      totals.failed += 1;
      await events.markFailed(claim.event.id, error instanceof Error ? error.message : String(error));
      await captureError(error, { source: SOURCES.backendCron, context: { job: 'payout_statement', payoutId: payout.id } });
    }
  }
  return totals;
}
