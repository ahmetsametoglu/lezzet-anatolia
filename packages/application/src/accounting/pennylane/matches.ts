import {
  MoneyDocumentService,
  MoneyMovementService,
  PennylaneDocumentService,
  PennylaneMatchRemovedService,
  PennylaneQueueService,
  PennylaneTransactionService,
  SalesInvoiceService,
  type Db,
} from '@lezzet/database';
import { pennylaneMatchPlan, pennylaneMatchReading, pennylaneOpenDifference } from '@lezzet/domain-core';
import { logger } from '@lezzet/observability';
import type { PennylaneDocumentMirror, PennylaneTransactionMatch } from '@lezzet/types';
import { linkStatementToDocument, movementAllocations } from '../sales-invoice-payment';
import { notifyPennylaneDocumentDifferent, notifyPennylaneMatchRemoved } from '../../notification/staff-events';
import type { PennylanePort } from './port';

/**
 * Banka satırının Pennylane eşleşmesi (docs/feature/kasa-muhasebe.md §8, akış 5): bizdeki bağlar Pennylane'e yazılır, Pennylane'de
 * kurulan ya da çözülen eşleşme okunur. Bizde olmayan faturaya kurulan eşleşmeye dokunulmaz.
 */

export type MatchWriteResult = { status: 'matched' | 'unchanged' | 'skipped' } | { status: 'blocked'; reason: 'foreign_matches' };

/** Faturanın Pennylane'deki anahtarı: alış ve müşteri faturası ayrı kaynaktır ve kimlikleri aynı sayı uzayındadır. */
type InvoiceKey = `${PennylaneTransactionMatch['kind']}:${number}`;
const keyOf = (match: PennylaneTransactionMatch): InvoiceKey => `${match.kind}:${match.invoiceId}`;
const matchOf = (key: InvoiceKey): PennylaneTransactionMatch => {
  const [kind, id] = key.split(':') as [PennylaneTransactionMatch['kind'], string];
  return { kind, invoiceId: Number(id) };
};
/** Açık kalanı izlenen alış faturaları; satış faturasının Pennylane'deki kalanı bizde aynalanmaz. */
const supplierIdsOf = (keys: Iterable<InvoiceKey>) =>
  [...new Set(keys)].flatMap((key) => {
    const match = matchOf(key);
    return match.kind === 'supplier' ? [match.invoiceId] : [];
  });

/**
 * Hareketin Pennylane'de karşılığı olan bağları, bağlanma sırasıyla: yüklenmiş alış belgelerine bağları ve ara hesaptan mahsup ettiği
 * kesilmiş satış faturaları. Karşılığı olmayan belgenin bağı yazılamaz.
 */
async function matchableAllocations(db: Db, movementId: string) {
  const allocations = (await movementAllocations(db, [movementId])).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const documentIds = allocations.map((allocation) => allocation.documentId);
  const [mirrors, sales, removed] = await Promise.all([
    new PennylaneDocumentService(db).listByDocuments(documentIds),
    new SalesInvoiceService(db).listByDocuments(documentIds),
    new PennylaneMatchRemovedService(db).listByAllocations(allocations.map((allocation) => allocation.id)),
  ]);
  const keyOfDocument = new Map<string, InvoiceKey>([
    ...mirrors.map((mirror) => [mirror.documentId, `supplier:${mirror.pennylaneInvoiceId}`] as const),
    ...sales.flatMap((invoice) =>
      invoice.pennylaneInvoiceId ? [[invoice.documentId, `customer:${invoice.pennylaneInvoiceId}`] as const] : [],
    ),
  ]);
  const removedIds = new Set(removed.map((row) => row.allocationId));
  return allocations.flatMap((allocation) => {
    const invoiceId = keyOfDocument.get(allocation.documentId);
    return invoiceId === undefined
      ? []
      : [{ id: allocation.id, documentId: allocation.documentId, invoiceId, removed: removedIds.has(allocation.id) }];
  });
}

/** Pennylane'deki eşleşmelerden bizim faturalarımız, belgesiyle: yüklediğimiz alış belgeleri ve kestiğimiz satış faturaları. */
async function ourDocumentsAmong(db: Db, keys: readonly InvoiceKey[]): Promise<Map<InvoiceKey, string>> {
  const ids = (kind: PennylaneTransactionMatch['kind']) =>
    keys.map(matchOf).flatMap((match) => (match.kind === kind ? [match.invoiceId] : []));
  const [mirrors, sales] = await Promise.all([
    new PennylaneDocumentService(db).listByInvoices(ids('supplier')),
    new SalesInvoiceService(db).listByPennylaneIds(ids('customer')),
  ]);
  return new Map<InvoiceKey, string>([
    ...mirrors.map((mirror) => [`supplier:${mirror.pennylaneInvoiceId}`, mirror.documentId] as const),
    ...sales.flatMap((invoice) =>
      invoice.pennylaneInvoiceId ? [[`customer:${invoice.pennylaneInvoiceId}`, invoice.documentId] as const] : [],
    ),
  ]);
}

/** Kuyruktaki hareketin bağlarını Pennylane'e yazar; Pennylane'de çözüldüğü işaretli bağ yazılmaz. */
export async function writeMovementMatches(db: Db, pennylane: PennylanePort, movementId: string): Promise<MatchWriteResult> {
  const transaction = await new PennylaneTransactionService(db).findByMovement(movementId);
  if (!transaction || transaction.removed) return { status: 'skipped' };
  const allocations = await matchableAllocations(db, movementId);
  const current = (await pennylane.transactionMatches(transaction.pennylaneId)).map(keyOf);
  const ours = new Set([...allocations.map((allocation) => allocation.invoiceId), ...(await ourDocumentsAmong(db, current)).keys()]);
  const plan = pennylaneMatchPlan({
    current,
    ours,
    desired: allocations.filter((allocation) => !allocation.removed).map((allocation) => allocation.invoiceId),
  });
  if (plan.kind === 'none') return { status: 'unchanged' };
  if (plan.kind === 'blocked') return { status: 'blocked', reason: plan.reason };
  if (plan.kind === 'rewrite') {
    // Tek bağı çözmek hepsini çözer; istenen küme ardından yeniden kurulur.
    await pennylane.unmatchTransaction({ ...matchOf(current.find((key) => ours.has(key))!), transactionId: transaction.pennylaneId });
  }
  for (const key of plan.invoiceIds) await pennylane.matchTransaction({ ...matchOf(key), transactionId: transaction.pennylaneId });
  await refreshPennylaneOpen(db, pennylane, supplierIdsOf([...current, ...plan.invoiceIds]));
  return { status: 'matched' };
}

/**
 * Pennylane'deki eşleşmenin bizdeki karşılığı, değişen banka satırı için. Bizdeki değişiklik kuyrukta bekliyorsa önce o yazılır ve
 * okuma atlanır, yoksa operatörün yeni çözdüğü bağ Pennylane'den geri benimsenirdi.
 */
export async function readMovementMatches(
  db: Db,
  pennylane: PennylanePort,
  input: { movementId: string; transactionId: number; accountId: string },
): Promise<void> {
  if (await new PennylaneQueueService(db).findByMovement(input.movementId)) return;
  const current = (await pennylane.transactionMatches(input.transactionId)).map(keyOf);
  const ourDocuments = await ourDocumentsAmong(db, current);
  const allocations = await matchableAllocations(db, input.movementId);
  const reading = pennylaneMatchReading({ current, ourDocuments, allocations });

  const movements = new MoneyMovementService(db);
  const movement = await movements.getById(input.movementId);
  if (!movement) return;
  if (movement.matchedElsewhere !== reading.elsewhere) await movements.update({ id: movement.id, matchedElsewhere: reading.elsewhere });
  for (const documentId of reading.adopt) {
    // Benimseme operatörün bağıyla aynı kapıdan geçer; satırın cevabı her bağla değiştiği için kapıya hareketin son hâli verilir.
    const latest = await movements.getById(movement.id);
    if (!latest) return;
    const outcome = await linkStatementToDocument(db, { movement: latest, documentId });
    if (outcome.status !== 'ok')
      logger.warn({ movementId: movement.id, documentId, reason: outcome.reason }, 'pennylane: eşleşme benimsenemedi');
  }
  const removedService = new PennylaneMatchRemovedService(db);
  for (const allocationId of reading.removed) {
    await removedService.save(allocationId);
    const allocation = allocations.find((row) => row.id === allocationId)!;
    await notifyPennylaneMatchRemoved(db, {
      movementId: movement.id,
      documentId: allocation.documentId,
      accountId: input.accountId,
      valueDate: movement.valueDate,
      dedupeKey: `pennylane-match-removed:${allocationId}`,
    });
  }
  for (const allocationId of reading.restored) await removedService.remove(allocationId);
  if (ourDocuments.size > 0 || allocations.length > 0) {
    await refreshPennylaneOpen(db, pennylane, supplierIdsOf([...current, ...allocations.map((allocation) => allocation.invoiceId)]));
  }
}

/** Faturalarımızın Pennylane'deki açık kalanı; bizimkinden ayrılan belge "Pennylane'de farklı"dır ve muhasebe uyarılır. */
export async function refreshPennylaneOpen(db: Db, pennylane: PennylanePort, invoiceIds: readonly number[]): Promise<void> {
  await refreshMirrors(db, pennylane, await new PennylaneDocumentService(db).listByInvoices(invoiceIds));
}

export async function refreshMirrors(db: Db, pennylane: PennylanePort, mirrors: readonly PennylaneDocumentMirror[]): Promise<void> {
  const service = new PennylaneDocumentService(db);
  for (const mirror of mirrors) {
    const pennylaneOpenCents = (await pennylane.getInvoice(mirror.pennylaneInvoiceId))?.openCents ?? null;
    await service.setPennylaneOpen(mirror.documentId, pennylaneOpenCents);
    await alertIfDifferent(db, { ...mirror, pennylaneOpenCents });
  }
}

/** Kuyrukta bekleyen belge karşılaştırılmaz, çünkü bizdeki değişiklik henüz Pennylane'e yazılmadı; haber iki kalanın çifti başına bir kez. */
async function alertIfDifferent(db: Db, mirror: PennylaneDocumentMirror): Promise<void> {
  if (await new PennylaneQueueService(db).findByDocument(mirror.documentId)) return;
  const documents = new MoneyDocumentService(db);
  const [document, balances] = await Promise.all([documents.getById(mirror.documentId), documents.balances([mirror.documentId])]);
  const open = balances.get(mirror.documentId)?.openAmountCents;
  if (!document || open === undefined) return;
  const pennylaneOpen = pennylaneOpenDifference(open, mirror);
  if (pennylaneOpen === null) return;
  await notifyPennylaneDocumentDifferent(db, {
    documentId: document.id,
    number: document.number,
    issuedOn: document.issuedOn,
    dedupeKey: `pennylane-different:${document.id}:${open}:${pennylaneOpen}`,
  });
}
