import { MoneyDocumentService, MoneyMovementService, PennylaneQueueService, type Db } from '@lezzet/database';
import { captureError, logger, SOURCES } from '@lezzet/observability';
import type { PennylaneQueue } from '@lezzet/types';
import { notifyPennylaneDocumentStuck, notifyPennylaneMatchStuck } from '../../notification/staff-events';
import { deferBlocked, deferFailed } from '../../queue/defer';
import { PENNYLANE_SYNC_JOB, pennylaneLiveFrom } from './bank-feed';
import { categoryResolver, type CategoryResolver } from './category';
import { privateDocumentFiles, writeDocument, type DocumentFileReader } from './documents';
import { writeMovementMatches } from './matches';
import type { PennylanePort } from './port';

/**
 * Pennylane yazım kuyruğunun turu: alış belgesi yüklenir ya da güncellenir, banka satırının eşleşmesi yazılır. Duran satır sebebiyle
 * bekler ve muhasebeye bir kez haber verir, düşen yazım ortak kuyruk kuralıyla ertelenir.
 */

const BATCH = 20;

export type PennylaneQueueOutcome = 'uploaded' | 'updated' | 'paid' | 'matched' | 'unchanged' | 'skipped' | 'blocked' | 'failed';

interface QueueContext {
  liveFrom: string;
  now: Date;
  files: DocumentFileReader;
  /** İşin kategorisi; tur başına iş başına bir kez çözülür. */
  category?: CategoryResolver;
}

/** Okuma kapalıyken hiçbir şey yazılmaz, çünkü canlıya geçiş günü kapsamın sınırıdır. */
export async function syncPennylaneQueue(
  db: Db,
  pennylane: PennylanePort,
  opts: { now?: Date; files?: DocumentFileReader } = {},
): Promise<Record<string, unknown>> {
  const liveFrom = await pennylaneLiveFrom(db);
  if (!liveFrom) return { skipped: 'not_live' };
  const ctx: QueueContext = {
    liveFrom,
    now: opts.now ?? new Date(),
    files: opts.files ?? privateDocumentFiles,
    category: categoryResolver(db, pennylane),
  };
  const rows = await new PennylaneQueueService(db).listDue(ctx.now.toISOString(), BATCH);
  const counts: Record<PennylaneQueueOutcome, number> = {
    uploaded: 0,
    updated: 0,
    paid: 0,
    matched: 0,
    unchanged: 0,
    skipped: 0,
    blocked: 0,
    failed: 0,
  };
  for (const row of rows) counts[await processPennylaneQueueRow(db, pennylane, row, ctx)] += 1;
  // Sonuç turun izinde iç içe durduğu için koşucunun "bir şey yaptı" kaydı onu görmez; yazım varsa burada kaydedilir.
  if (rows.length > counts.unchanged + counts.skipped) logger.info({ job: PENNYLANE_SYNC_JOB, ...counts }, 'pennylane: yazım kuyruğu');
  return counts;
}

/** Kuyruğun tek satırı: yazılırsa ya da yazılacak bir şey yoksa tamamlanır, durursa ya da hata alırsa ertelenir. */
export async function processPennylaneQueueRow(
  db: Db,
  pennylane: PennylanePort,
  row: PennylaneQueue,
  ctx: QueueContext,
): Promise<PennylaneQueueOutcome> {
  const queue = new PennylaneQueueService(db);
  try {
    const result = row.documentId
      ? await writeDocument(db, pennylane, row.documentId, ctx)
      : await writeMovementMatches(db, pennylane, row.movementId!);
    if (result.status === 'blocked') {
      // Dosyasız belge çoğu zaman dosyası yüklenmek üzere olan belgedir; dosya gelince kuyruğa yeniden düşer, haber gürültü olurdu.
      const { firstTime } = await deferBlocked(queue, row, result.reason, ctx.now);
      if (firstTime && result.reason !== 'no_file') await alertStuck(db, row, result.reason);
      return 'blocked';
    }
    await queue.complete(row.id, row.markedAt);
    return result.status;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const { attempts, alert } = await deferFailed(queue, row, message, ctx.now);
    const target = { documentId: row.documentId, movementId: row.movementId, attempts };
    if (alert) {
      await captureError(err, { source: SOURCES.backendCron, context: { job: PENNYLANE_SYNC_JOB, ...target } });
      await alertStuck(db, row, 'error');
    } else {
      logger.warn({ ...target, err: message }, 'pennylane: yazım ertelendi');
    }
    return 'failed';
  }
}

/** Yazılamayan kaydın haberi, kayıt ve sebep başına bir kez. */
async function alertStuck(db: Db, row: PennylaneQueue, reason: string): Promise<void> {
  if (row.documentId) {
    const document = await new MoneyDocumentService(db).getById(row.documentId);
    if (!document) return;
    await notifyPennylaneDocumentStuck(db, {
      documentId: document.id,
      number: document.number,
      issuedOn: document.issuedOn,
      reason,
      dedupeKey: `pennylane-document:${document.id}:${reason}`,
    });
    return;
  }
  const movement = await new MoneyMovementService(db).getById(row.movementId!);
  if (!movement) return;
  await notifyPennylaneMatchStuck(db, {
    movementId: movement.id,
    accountId: movement.accountId,
    valueDate: movement.valueDate,
    reason,
    dedupeKey: `pennylane-match:${movement.id}:${reason}`,
  });
}
