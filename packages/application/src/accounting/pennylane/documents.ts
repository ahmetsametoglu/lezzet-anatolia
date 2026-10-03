import {
  CounterpartyService,
  MoneyAllocationService,
  MoneyDocumentService,
  MoneyMovementService,
  PennylaneDocumentService,
  PennylaneQueueService,
  PennylaneSupplierService,
  SupplierService,
  type Db,
} from '@lezzet/database';
import {
  checkDocumentFile,
  isPennylaneDocumentReference,
  pennylaneDocumentScope,
  pennylaneInvoiceDraft,
  pennylaneInvoicePatch,
  pennylanePartyReference,
  pennylanePaymentStatus,
  type PennylaneDocumentBlock,
} from '@lezzet/domain-core';
import { captureError, logger, SOURCES } from '@lezzet/observability';
import { privateReadUrl } from '@lezzet/storage';
import type { MoneyDocument, PennylaneInvoiceDraft, PennylanePaymentStatus, PennylaneQueue } from '@lezzet/types';
import { notifyPennylaneDocumentStuck } from '../../notification/staff-events';
import { deferBlocked, deferFailed } from '../../queue/defer';
import { PENNYLANE_SYNC_JOB, pennylaneLiveFrom } from './bank-feed';
import type { PennylanePort } from './port';

/**
 * Alış belgesinin Pennylane'e yazımı (docs/feature/kasa-muhasebe.md §8, akış 2–3): kuyruktaki belgenin kararı motordan çıkar, karşı
 * tarafın tedarikçisi bulunur ya da açılır, belge yüklenir ya da farkı güncellenir, nakitle kapandıysa ödendi işaretlenir.
 */

const BATCH = 20;

/** Belgenin dosyası; okuma testte ağa çıkmayan bir kaynakla değiştirilir. */
export interface DocumentFileReader {
  read(fileKey: string): Promise<Uint8Array>;
}

export type PennylaneDocumentOutcome = 'uploaded' | 'updated' | 'paid' | 'unchanged' | 'skipped' | 'blocked' | 'failed';

type WriteResult =
  { status: Exclude<PennylaneDocumentOutcome, 'blocked' | 'failed'> } | { status: 'blocked'; reason: PennylaneDocumentBlock };

interface SyncContext {
  liveFrom: string;
  now: Date;
  files: DocumentFileReader;
}

/** Karşı taraf: tedarikçinin ülkesi ters yüklemenin kodunu seçer, carinin ülkesi tutulmaz. */
type Party =
  | { kind: 'supplier'; id: string; name: string; country: string | null; vatNumber: string | null; dueDays: number | null }
  | { kind: 'counterparty'; id: string; name: string };

/** Belge kuyruğunun turu; okuma kapalıyken hiçbir belge yazılmaz, çünkü canlıya geçiş günü kapsamın sınırıdır. */
export async function syncPennylaneDocuments(
  db: Db,
  pennylane: PennylanePort,
  opts: { now?: Date; files?: DocumentFileReader } = {},
): Promise<Record<string, unknown>> {
  const liveFrom = await pennylaneLiveFrom(db);
  if (!liveFrom) return { skipped: 'not_live' };
  const ctx: SyncContext = { liveFrom, now: opts.now ?? new Date(), files: opts.files ?? privateFiles };
  const rows = await new PennylaneQueueService(db).listDue(ctx.now.toISOString(), BATCH);
  const counts: Record<PennylaneDocumentOutcome, number> = {
    uploaded: 0,
    updated: 0,
    paid: 0,
    unchanged: 0,
    skipped: 0,
    blocked: 0,
    failed: 0,
  };
  for (const row of rows) counts[await processPennylaneDocumentRow(db, pennylane, row, ctx)] += 1;
  // Sonuç turun izinde iç içe durduğu için koşucunun "bir şey yaptı" kaydı onu görmez; yazım varsa burada kaydedilir.
  if (counts.uploaded + counts.updated + counts.paid + counts.blocked + counts.failed > 0) {
    logger.info({ job: PENNYLANE_SYNC_JOB, ...counts }, 'pennylane: belge kuyruğu');
  }
  return counts;
}

/** Kuyruğun tek satırı: yazılırsa ya da yazılacak bir şey yoksa tamamlanır, durursa ya da hata alırsa ertelenir. */
export async function processPennylaneDocumentRow(
  db: Db,
  pennylane: PennylanePort,
  row: PennylaneQueue,
  ctx: SyncContext,
): Promise<PennylaneDocumentOutcome> {
  const queue = new PennylaneQueueService(db);
  try {
    const result = await writeDocument(db, pennylane, row.documentId, ctx);
    if (result.status === 'blocked') {
      // Dosyasız belge çoğu zaman dosyası yüklenmek üzere olan belgedir; dosya gelince kuyruğa yeniden düşer, haber gürültü olurdu.
      const { firstTime } = await deferBlocked(queue, row, result.reason, ctx.now);
      if (firstTime && result.reason !== 'no_file') await alertStuck(db, row.documentId, result.reason);
      return 'blocked';
    }
    await queue.complete(row.id, row.markedAt);
    return result.status;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const { attempts, alert } = await deferFailed(queue, row, message, ctx.now);
    if (alert) {
      await captureError(err, { source: SOURCES.backendCron, context: { job: PENNYLANE_SYNC_JOB, documentId: row.documentId, attempts } });
      await alertStuck(db, row.documentId, 'error');
    } else {
      logger.warn({ documentId: row.documentId, attempts, err: message }, 'pennylane: belge yazımı ertelendi');
    }
    return 'failed';
  }
}

async function writeDocument(db: Db, pennylane: PennylanePort, documentId: string, ctx: SyncContext): Promise<WriteResult> {
  const document = await new MoneyDocumentService(db).getById(documentId);
  if (!document) return { status: 'skipped' };
  const mirrors = new PennylaneDocumentService(db);
  const [mirror, party] = await Promise.all([mirrors.findByDocument(documentId), partyOf(db, document)]);
  const scope = pennylaneDocumentScope({
    document,
    partyCountry: party?.kind === 'supplier' ? party.country : null,
    liveFrom: ctx.liveFrom,
    uploaded: mirror !== null,
  });
  if (scope.kind === 'skip') return { status: 'skipped' };
  if (scope.kind === 'blocked') return { status: 'blocked', reason: scope.reason };
  // Kapsam karşı tarafı ve dosyayı denetledi; kayıt okunamadıysa da yazılmaz.
  if (!party) return { status: 'blocked', reason: 'no_party' };
  if (!document.fileKey) return { status: 'blocked', reason: 'no_file' };

  const draft = pennylaneInvoiceDraft(document, await ensureSupplier(db, pennylane, party), scope.lines);
  let invoiceId: number;
  let outcome: 'uploaded' | 'updated' | 'unchanged';
  if (!mirror) {
    const uploaded = await upload(pennylane, document.fileKey, draft, ctx.files);
    if (uploaded.status === 'blocked') return uploaded;
    invoiceId = uploaded.invoiceId;
    await mirrors.save({ documentId, pennylaneInvoiceId: invoiceId, written: draft });
    outcome = 'uploaded';
  } else {
    invoiceId = mirror.pennylaneInvoiceId;
    const patch = pennylaneInvoicePatch(mirror.written, draft);
    if (patch?.invoiceNumber && (await numberTaken(pennylane, draft.supplierId, patch.invoiceNumber, invoiceId))) {
      return { status: 'blocked', reason: 'duplicate_number' };
    }
    if (patch) {
      await pennylane.updateInvoice(invoiceId, patch);
      await mirrors.save({ documentId, pennylaneInvoiceId: invoiceId, written: draft });
    }
    outcome = patch ? 'updated' : 'unchanged';
  }
  const paid = await writePaymentStatus(db, pennylane, document, invoiceId, mirror?.paymentStatus ?? null);
  return { status: outcome === 'unchanged' && paid ? 'paid' : outcome };
}

/**
 * Yarıda kalan yükleme dış referansla bulunur, aynı tedarikçide aynı numara Pennylane'e sorulur. Aynı içerikli dosya başka faturada
 * duruyorsa o fatura bizim başka belgemizinse belge bekler, değilse benimsenir.
 */
async function upload(
  pennylane: PennylanePort,
  fileKey: string,
  draft: PennylaneInvoiceDraft,
  files: DocumentFileReader,
): Promise<{ status: 'uploaded'; invoiceId: number } | { status: 'blocked'; reason: PennylaneDocumentBlock }> {
  const [existing] = await pennylane.findInvoices({ externalReference: draft.externalReference });
  if (existing) return { status: 'uploaded', invoiceId: existing.id };
  if (draft.invoiceNumber && (await numberTaken(pennylane, draft.supplierId, draft.invoiceNumber, null))) {
    return { status: 'blocked', reason: 'duplicate_number' };
  }

  const file = checkDocumentFile(fileKey);
  if (!file.ok) return { status: 'blocked', reason: 'file_type' };
  const fileId = await pennylane.uploadFile({
    bytes: await files.read(fileKey),
    contentType: file.contentType,
    filename: `${(draft.invoiceNumber ?? 'belge').replace(/[^\w.-]+/g, '-')}.${file.extension}`,
  });
  const imported = await pennylane.importInvoice({ draft, fileId });
  if (imported.status === 'imported') return { status: 'uploaded', invoiceId: imported.invoice.id };
  const holder = await pennylane.getInvoice(imported.existingId);
  if (isPennylaneDocumentReference(holder?.externalReference ?? null)) return { status: 'blocked', reason: 'duplicate_file' };
  return { status: 'uploaded', invoiceId: imported.existingId };
}

/** Aynı tedarikçide aynı numaralı başka fatura var mı; Pennylane bunu kendisi yakalamıyor. */
async function numberTaken(
  pennylane: PennylanePort,
  supplierId: number,
  invoiceNumber: string,
  ownInvoiceId: number | null,
): Promise<boolean> {
  const found = await pennylane.findInvoices({ supplierId, invoiceNumber });
  return found.some((invoice) => invoice.id !== ownInvoiceId);
}

/** Karşı tarafın Pennylane'deki tedarikçisi; aynada yoksa dış referansla aranır, bulunmazsa açılır. */
async function ensureSupplier(db: Db, pennylane: PennylanePort, party: Party): Promise<number> {
  const mirrors = new PennylaneSupplierService(db);
  const key = party.kind === 'supplier' ? { supplierId: party.id } : { counterpartyId: party.id };
  const mirror = await mirrors.findByParty(key);
  if (mirror) return mirror.pennylaneId;
  const reference = pennylanePartyReference(key);
  const supplier =
    (await pennylane.findSupplier(reference)) ??
    (await pennylane.createSupplier({
      name: party.name,
      externalReference: reference,
      vatNumber: party.kind === 'supplier' ? party.vatNumber : null,
      dueDays: party.kind === 'supplier' ? party.dueDays : null,
    }));
  await mirrors.save({
    pennylaneId: supplier.id,
    supplierId: party.kind === 'supplier' ? party.id : null,
    counterpartyId: party.kind === 'counterparty' ? party.id : null,
  });
  return supplier.id;
}

async function partyOf(db: Db, document: MoneyDocument): Promise<Party | null> {
  if (document.supplierId) {
    const supplier = await new SupplierService(db).getById(document.supplierId);
    return supplier
      ? {
          kind: 'supplier',
          id: supplier.id,
          name: supplier.name,
          country: supplier.country,
          vatNumber: supplier.vatNumber,
          dueDays: supplier.paymentTermDays,
        }
      : null;
  }
  if (document.counterpartyId) {
    const counterparty = await new CounterpartyService(db).getById(document.counterpartyId);
    return counterparty ? { kind: 'counterparty', id: counterparty.id, name: counterparty.name } : null;
  }
  return null;
}

/** Ödeme durumu belgenin açık kalanından ve bağlı hareketlerin kaynağından; açık kalan okunamazsa hiçbir işaret yazılmaz. */
async function writePaymentStatus(
  db: Db,
  pennylane: PennylanePort,
  document: MoneyDocument,
  invoiceId: number,
  written: PennylanePaymentStatus | null,
): Promise<boolean> {
  const [balances, allocations] = await Promise.all([
    new MoneyDocumentService(db).balances([document.id]),
    new MoneyAllocationService(db).listByDocuments([document.id]),
  ]);
  const balance = balances.get(document.id);
  if (!balance) return false;
  const movements = await new MoneyMovementService(db).listByIds(allocations.map((allocation) => allocation.movementId));
  const bank = new Map(movements.map((movement) => [movement.id, movement.source === 'bank_import']));
  const status = pennylanePaymentStatus({
    openAmountCents: balance.openAmountCents,
    allocations: allocations.map((allocation) => ({ bank: bank.get(allocation.movementId) ?? false })),
    written,
  });
  if (!status) return false;
  await pennylane.setPaymentStatus(invoiceId, status);
  await new PennylaneDocumentService(db).setPaymentStatus(document.id, status);
  return true;
}

async function alertStuck(db: Db, documentId: string, reason: string): Promise<void> {
  const document = await new MoneyDocumentService(db).getById(documentId);
  if (!document) return;
  await notifyPennylaneDocumentStuck(db, {
    documentId,
    number: document.number,
    issuedOn: document.issuedOn,
    reason,
    dedupeKey: `pennylane-document:${documentId}:${reason}`,
  });
}

/** Özel kovanın tek okuma yolu imzalı adrestir. */
const privateFiles: DocumentFileReader = {
  async read(fileKey) {
    const url = await privateReadUrl(fileKey);
    if (!url) throw new Error('belge dosyası okunamadı: özel kova yapılandırılmamış');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`belge dosyası okunamadı (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  },
};
