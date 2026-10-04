import {
  MoneyAllocationService,
  MoneyDocumentService,
  MoneyMovementService,
  PennylaneDocumentService,
  PennylaneMatchRemovedService,
  PennylaneQueueService,
  PennylaneTransactionService,
  type Db,
} from '@lezzet/database';
import { pennylaneMatchPlan, pennylaneMatchReading, pennylaneOpenDifference } from '@lezzet/domain-core';
import { logger } from '@lezzet/observability';
import type { PennylaneDocumentMirror } from '@lezzet/types';
import { linkMovementToDocument } from '../document';
import { notifyPennylaneDocumentDifferent, notifyPennylaneMatchRemoved } from '../../notification/staff-events';
import type { PennylanePort } from './port';

/**
 * Banka satırının Pennylane eşleşmesi (docs/feature/kasa-muhasebe.md §8, akış 5): bizdeki bağlar Pennylane'e yazılır, Pennylane'de
 * kurulan ya da çözülen eşleşme okunur. Bizde olmayan faturaya kurulan eşleşmeye dokunulmaz.
 */

export type MatchWriteResult = { status: 'matched' | 'unchanged' | 'skipped' } | { status: 'blocked'; reason: 'foreign_matches' };

/** Hareketin yüklenmiş belgelere bağları, bağlanma sırasıyla; Pennylane'de karşılığı olmayan belgenin bağı yazılamaz. */
async function uploadedAllocations(db: Db, movementId: string) {
  const allocations = (await new MoneyAllocationService(db).listByMovements([movementId])).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  const [mirrors, removed] = await Promise.all([
    new PennylaneDocumentService(db).listByDocuments(allocations.map((allocation) => allocation.documentId)),
    new PennylaneMatchRemovedService(db).listByAllocations(allocations.map((allocation) => allocation.id)),
  ]);
  const invoiceOf = new Map(mirrors.map((mirror) => [mirror.documentId, mirror.pennylaneInvoiceId]));
  const removedIds = new Set(removed.map((row) => row.allocationId));
  return allocations.flatMap((allocation) => {
    const invoiceId = invoiceOf.get(allocation.documentId);
    return invoiceId === undefined
      ? []
      : [{ id: allocation.id, documentId: allocation.documentId, invoiceId, removed: removedIds.has(allocation.id) }];
  });
}

/** Kuyruktaki hareketin bağlarını Pennylane'e yazar; Pennylane'de çözüldüğü işaretli bağ yazılmaz. */
export async function writeMovementMatches(db: Db, pennylane: PennylanePort, movementId: string): Promise<MatchWriteResult> {
  const transaction = await new PennylaneTransactionService(db).findByMovement(movementId);
  if (!transaction || transaction.removed) return { status: 'skipped' };
  const allocations = await uploadedAllocations(db, movementId);
  const current = (await pennylane.transactionMatches(transaction.pennylaneId)).map((match) => match.invoiceId);
  const ours = new Set([
    ...allocations.map((allocation) => allocation.invoiceId),
    ...(await new PennylaneDocumentService(db).listByInvoices(current)).map((mirror) => mirror.pennylaneInvoiceId),
  ]);
  const plan = pennylaneMatchPlan({
    current,
    ours,
    desired: allocations.filter((allocation) => !allocation.removed).map((allocation) => allocation.invoiceId),
  });
  if (plan.kind === 'none') return { status: 'unchanged' };
  if (plan.kind === 'blocked') return { status: 'blocked', reason: plan.reason };
  if (plan.kind === 'rewrite') {
    // Tek bağı çözmek hepsini çözer; istenen küme ardından yeniden kurulur.
    await pennylane.unmatchTransaction({ invoiceId: current.find((id) => ours.has(id))!, transactionId: transaction.pennylaneId });
  }
  for (const invoiceId of plan.invoiceIds) await pennylane.matchTransaction({ invoiceId, transactionId: transaction.pennylaneId });
  await refreshPennylaneOpen(db, pennylane, [...new Set([...current, ...plan.invoiceIds])]);
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
  const current = (await pennylane.transactionMatches(input.transactionId)).map((match) => match.invoiceId);
  const ourMirrors = await new PennylaneDocumentService(db).listByInvoices(current);
  const allocations = await uploadedAllocations(db, input.movementId);
  const reading = pennylaneMatchReading({
    current,
    ourDocuments: new Map(ourMirrors.map((mirror) => [mirror.pennylaneInvoiceId, mirror.documentId])),
    allocations,
  });

  const movements = new MoneyMovementService(db);
  const movement = await movements.getById(input.movementId);
  if (!movement) return;
  if (movement.matchedElsewhere !== reading.elsewhere) await movements.update({ id: movement.id, matchedElsewhere: reading.elsewhere });
  for (const documentId of reading.adopt) {
    // Benimseme operatörün bağıyla aynı kapıdan geçer; satırın cevabı her bağla değiştiği için kapıya hareketin son hâli verilir.
    const latest = await movements.getById(movement.id);
    if (!latest) return;
    const outcome = await linkMovementToDocument(db, { movement: latest, documentId });
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
  if (ourMirrors.length > 0 || allocations.length > 0) {
    await refreshPennylaneOpen(db, pennylane, [...new Set([...current, ...allocations.map((allocation) => allocation.invoiceId)])]);
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
