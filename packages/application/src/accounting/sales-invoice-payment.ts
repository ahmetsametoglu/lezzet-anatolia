import {
  MoneyAllocationService,
  MoneyDocumentOrderService,
  MoneyDocumentService,
  MoneyMovementService,
  OrderItemService,
  OrderSaleService,
  SalesInvoiceService,
  type Db,
} from '@lezzet/database';
import { salesInvoicePaymentShares, salesInvoiceTotals, type SalesInvoiceOrderDue } from '@lezzet/domain-core';
import { logger } from '@lezzet/observability';
import { SYSTEM_ACCOUNT_IDS, type MoneyAllocation, type MoneyMovement } from '@lezzet/types';
import { syncOrderPaymentStatus } from '../order/payment';
import { allocateToDocument } from './document';

/**
 * Satış faturasının tahsilatı (profesyonel satış Faz 5): havale "Fatura tahsilatı" ara hesabına transfer olur, ara hesapta faturanın
 * siparişlerine havale tahsilatı yazılır ve faturaya bağlanır. Banka parayı bir kez sayar, siparişin ödeme durumu kendi kuralıyla türer.
 */

export type SettlementReason =
  | 'not_found'
  | 'not_bank_row'
  | 'already_reconciled'
  | 'direction_mismatch'
  | 'not_issued'
  | 'other_match'
  | 'already_allocated'
  | 'business_mismatch'
  | 'nothing_to_allocate'
  | 'document_settled';

export type SettlementOutcome =
  { status: 'ok'; settledCents: number; remainingCents: number } | { status: 'invalid'; reason: SettlementReason };

const invalid = (reason: SettlementReason): SettlementOutcome => ({ status: 'invalid', reason });

/**
 * Ekstre satırını kesilmiş satış faturasına mahsup eder: tutar satırın kalanı ile faturanın açığının küçüğüdür ve faturanın içinde en
 * eski siparişten başlar. Kalanı olan satır kuyrukta kalır ve yalnız aynı işin başka satış faturasına bağlanır.
 */
export async function settleSalesInvoice(db: Db, input: { movement: MoneyMovement; documentId: string }): Promise<SettlementOutcome> {
  const { movement } = input;
  if (movement.source !== 'bank_import') return invalid('not_bank_row');
  if (movement.reconciled) return invalid('already_reconciled');
  if (movement.direction !== 'in') return invalid('direction_mismatch');
  const clearingId = SYSTEM_ACCOUNT_IDS.invoice_clearing;
  const movements = new MoneyMovementService(db);
  const documents = new MoneyDocumentService(db);
  const allocations = new MoneyAllocationService(db);
  const [document, invoice, own, funded] = await Promise.all([
    documents.getById(input.documentId),
    new SalesInvoiceService(db).findByDocument(input.documentId),
    allocations.listByMovements([movement.id]),
    movements.listFundedBy([movement.id]),
  ]);
  if (!document?.customerId || !invoice) return invalid('not_found');
  if (invoice.status !== 'issued') return invalid('not_issued');
  const settling = movement.type === 'transfer' && movement.counterAccountId === clearingId;
  if ((movement.type !== 'misc' && !settling) || own.length > 0) return invalid('other_match');

  const fundedAllocations = await allocations.listByMovements(funded.map((payment) => payment.id));
  if (fundedAllocations.some((allocation) => allocation.documentId === document.id)) return invalid('already_allocated');
  const others = await documents.listByIds([...new Set(fundedAllocations.map((allocation) => allocation.documentId))]);
  if (others.some((other) => other.business !== document.business)) return invalid('business_mismatch');

  const remainingCents = movement.amountCents - funded.reduce((sum, payment) => sum + payment.amountCents, 0);
  if (remainingCents <= 0) return invalid('nothing_to_allocate');
  const openCents = (await documents.balances([document.id])).get(document.id)?.openAmountCents ?? 0;
  if (openCents <= 0) return invalid('document_settled');
  const shares = salesInvoicePaymentShares(Math.min(remainingCents, openCents), await orderDuesOf(db, document.id));
  if (shares.length === 0) return invalid('document_settled');

  const left = await movements.settleSalesInvoice({
    movementId: movement.id,
    documentId: document.id,
    clearingAccountId: clearingId,
    shares,
    description: `${document.number ?? 'Satış faturası'} havalesi`,
  });
  for (const share of shares) await syncOrderPaymentStatus(db, share.orderId);
  return { status: 'ok', settledCents: shares.reduce((sum, share) => sum + share.amountCents, 0), remainingCents: left };
}

/** Faturadaki siparişlerin kalanı: siparişin faturadaki payı, faturanın kendi hesabıyla, ona bağlanmış tahsilat düşülerek. */
async function orderDuesOf(db: Db, documentId: string): Promise<SalesInvoiceOrderDue[]> {
  const orderIds = (await new MoneyDocumentOrderService(db).ordersOf([documentId])).get(documentId) ?? [];
  const [sales, items, allocations] = await Promise.all([
    new OrderSaleService(db).listByIds(orderIds),
    new OrderItemService(db).listByOrders(orderIds),
    new MoneyAllocationService(db).listByDocuments([documentId]),
  ]);
  const payments = await new MoneyMovementService(db).listByIds(allocations.map((allocation) => allocation.movementId));
  const orderOf = new Map(payments.map((payment) => [payment.id, payment.orderId] as const));
  const paidOf = new Map<string, number>();
  for (const allocation of allocations) {
    const orderId = orderOf.get(allocation.movementId);
    if (orderId) paidOf.set(orderId, (paidOf.get(orderId) ?? 0) + allocation.amountCents);
  }
  return sales.map((sale) => ({
    orderId: sale.id,
    saleDate: sale.saleDate,
    dueCents:
      salesInvoiceTotals([{ sale, items: items.filter((item) => item.orderId === sale.id) }]).amountCents - (paidOf.get(sale.id) ?? 0),
  }));
}

/**
 * Hareketlerin belge bağları; ara hesaba transfer olan ekstre satırının bağları, parasıyla yazılan tahsilatların bağlarıdır ve satırın
 * adına döner. Satırın kalanı ve bağlı belgeleri buradan okunur.
 */
export async function movementAllocations(db: Db, movementIds: readonly string[]): Promise<MoneyAllocation[]> {
  if (movementIds.length === 0) return [];
  const allocations = new MoneyAllocationService(db);
  const [own, funded] = await Promise.all([
    allocations.listByMovements(movementIds),
    new MoneyMovementService(db).listFundedBy(movementIds),
  ]);
  const fundingOf = new Map(funded.map((payment) => [payment.id, payment.fundingMovementId] as const));
  const fundedAllocations = await allocations.listByMovements(funded.map((payment) => payment.id));
  return [
    ...own,
    ...fundedAllocations.flatMap((allocation) => {
      const statementId = fundingOf.get(allocation.movementId);
      return statementId ? [{ ...allocation, movementId: statementId }] : [];
    }),
  ];
}

/** Ara hesaptaki tahsilatların parasını getiren ekstre satırlarının hesabı; iade o hesaptan planlanır (`refundableMovementsOf`). */
export async function fundingAccountsOf(
  db: Db,
  movements: readonly Pick<MoneyMovement, 'fundingMovementId'>[],
): Promise<Map<string, string>> {
  const ids = [...new Set(movements.flatMap((movement) => (movement.fundingMovementId ? [movement.fundingMovementId] : [])))];
  if (ids.length === 0) return new Map();
  return new Map((await new MoneyMovementService(db).listByIds(ids)).map((movement) => [movement.id, movement.accountId] as const));
}

/** Ekstre satırının parasıyla tahsilat yazılan siparişler; eşleşme geri alınınca ödeme durumları yeniden türer. */
export async function ordersFundedBy(db: Db, movementId: string): Promise<string[]> {
  const funded = await new MoneyMovementService(db).listFundedBy([movementId]);
  return [...new Set(funded.flatMap((payment) => (payment.orderId ? [payment.orderId] : [])))];
}

/** Tahsilatı satış faturasına bağlar; kapanmış faturaya bağ kurulmaz, öteki ret izlenir. */
export async function allocatePaymentToInvoice(db: Db, input: { movementId: string; documentId: string }): Promise<void> {
  const outcome = await allocateToDocument(db, input);
  if (outcome.status === 'invalid' && outcome.reason !== 'document_settled') {
    logger.warn({ ...input, reason: outcome.reason }, 'satış faturası: tahsilat faturaya bağlanamadı');
  }
}

/** Siparişe doğrudan bağlanan tahsilat, sipariş faturalıysa faturaya da bağlanır ki faturanın açığı tahsilatı görsün. */
export async function allocateToOrderInvoice(db: Db, input: { movementId: string; orderId: string }): Promise<void> {
  const documentId = (await new MoneyDocumentOrderService(db).documentsOfOrders([input.orderId])).get(input.orderId);
  if (documentId) await allocatePaymentToInvoice(db, { movementId: input.movementId, documentId });
}
