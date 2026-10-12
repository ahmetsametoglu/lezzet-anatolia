import {
  AddressService,
  MoneyDocumentOrderService,
  MoneyDocumentService,
  MoneyMovementService,
  OrderItemService,
  OrderSaleService,
  SalesInvoiceCandidateService,
  SalesInvoiceService,
  SettingsService,
  UserProfileService,
  type Db,
} from '@lezzet/database';
import {
  PAYMENT_TERM_DAYS_DEFAULT,
  PAYMENT_TERM_DAYS_KEY,
  salesInvoiceDueOn,
  salesInvoiceGaps,
  salesInvoiceGroups,
  salesInvoiceOpensNow,
  salesInvoiceTotals,
  type SalesInvoiceTotals,
} from '@lezzet/domain-core';
import { parisDateOf, parisMinutesOf } from '@lezzet/helper';
import { captureError, logger, SOURCES } from '@lezzet/observability';
import type { Business, DocumentVatLine, MoneyDocument, OrderItem, OrderSale, SalesInvoiceGap, UserProfile } from '@lezzet/types';
import { allocateToDocument } from './document';

/**
 * Satış faturasının açılışı (docs/feature/profesyonel-satis.md, karar 17–18): teslim edilen B2B satışın faturası teslim başına modda
 * hemen, ay sonu modunda ayın son günü bizde açılır. Bilgisi tam olan kuyruğa girer ve Pennylane'de kesilir, eksik olan onay bekler;
 * siparişin tahsil edilmiş parası faturaya bağlanır ki faturanın açık kalanı doğru olsun.
 */

export const SALES_INVOICE_OPEN_JOB = 'sales-invoice-open';

/** Faturanın hesabı için okunanlar: satışlar, kalemleri, müşteriler, fatura adresi olanlar ve genel vade. */
interface InvoiceReads {
  sales: Map<string, OrderSale>;
  items: Map<string, OrderItem[]>;
  customers: Map<string, UserProfile>;
  billed: Set<string>;
  termDays: number;
}

/** Faturanın künyesi: tutar ve kırılım, vade ve kesmeyi bekleten eksikler. */
type ComposedInvoice = SalesInvoiceTotals & { dueOn: string; missing: SalesInvoiceGap[] };

/**
 * İşin turu: açılma anı gelmiş satışların faturası açılır, onay bekleyen faturalar müşteri kaydından yeniden hesaplanır.
 * `customerIds` turu o müşterilere daraltır.
 */
export async function openSalesInvoices(
  db: Db,
  opts: { now?: Date; customerIds?: readonly string[] } = {},
): Promise<Record<string, number>> {
  const now = opts.now ?? new Date();
  const today = { day: parisDateOf(now), minutes: parisMinutesOf(now) };
  const due = (await new SalesInvoiceCandidateService(db).list(opts.customerIds)).filter((sale) => salesInvoiceOpensNow(sale, today));
  const counts = { queued: 0, awaiting: 0, empty: 0, failed: 0, refreshed: 0 };
  if (due.length > 0) {
    const reads = await readInvoiceInputs(
      db,
      due.map((sale) => sale.orderId),
      due.map((sale) => sale.customerId),
    );
    for (const group of salesInvoiceGroups(due)) {
      const orderIds = group.map((sale) => sale.orderId);
      try {
        counts[await openInvoice(db, { customerId: group[0]!.customerId, business: group[0]!.business, orderIds }, reads, today.day)] += 1;
      } catch (err) {
        counts.failed += 1;
        await captureError(err, { source: SOURCES.backendCron, context: { job: SALES_INVOICE_OPEN_JOB, orderIds } });
      }
    }
  }
  counts.refreshed = await refreshAwaitingInvoices(db, opts.customerIds);
  return counts;
}

async function openInvoice(
  db: Db,
  input: { customerId: string; business: Business; orderIds: string[] },
  reads: InvoiceReads,
  issuedOn: string,
): Promise<'queued' | 'awaiting' | 'empty'> {
  const composed = composeInvoice(input.customerId, input.orderIds, reads, issuedOn);
  // Belge sıfır tutar almaz; ücretlenen kalemi olmayan teslim faturalanmaz ve her turda sayılarak görünür kalır.
  if (composed.amountCents <= 0) return 'empty';
  const documentId = await new SalesInvoiceService(db).open({ ...input, issuedOn, ...composed });
  await allocateOrderPayments(db, documentId, input.orderIds);
  return composed.missing.length === 0 ? 'queued' : 'awaiting';
}

function composeInvoice(customerId: string, orderIds: readonly string[], reads: InvoiceReads, issuedOn: string): ComposedInvoice {
  const customer = reads.customers.get(customerId);
  const sales = orderIds.map((id) => reads.sales.get(id));
  if (!customer || sales.some((sale) => !sale)) throw new Error('Satış faturasının müşterisi ya da satışı okunamadı');
  const parts = (sales as OrderSale[]).map((sale) => ({ sale, items: reads.items.get(sale.id) ?? [] }));
  const firstDeliveryOn = parts.map((part) => part.sale.saleDate).sort()[0]!;
  return {
    ...salesInvoiceTotals(parts),
    dueOn: salesInvoiceDueOn({ issuedOn, termDays: customer.paymentTermDays ?? reads.termDays, firstDeliveryOn }),
    missing: salesInvoiceGaps(customer, reads.billed.has(customerId)),
  };
}

async function readInvoiceInputs(db: Db, orderIds: readonly string[], customerIds: readonly string[]): Promise<InvoiceReads> {
  const uniqueCustomers = [...new Set(customerIds)];
  const addresses = new AddressService(db);
  const [sales, items, customers, billing, termDays] = await Promise.all([
    new OrderSaleService(db).listByIds(orderIds),
    new OrderItemService(db).listByOrders(orderIds),
    new UserProfileService(db).listByIds(uniqueCustomers),
    Promise.all(uniqueCustomers.map(async (id) => ({ id, billed: (await addresses.listByCustomer(id)).some((a) => a.isBilling) }))),
    new SettingsService(db).getNumber(PAYMENT_TERM_DAYS_KEY, PAYMENT_TERM_DAYS_DEFAULT),
  ]);
  const itemsByOrder = new Map<string, OrderItem[]>();
  for (const item of items) itemsByOrder.set(item.orderId, [...(itemsByOrder.get(item.orderId) ?? []), item]);
  return {
    sales: new Map(sales.map((sale) => [sale.id, sale])),
    items: itemsByOrder,
    customers: new Map(customers.map((customer) => [customer.id, customer])),
    billed: new Set(billing.filter((row) => row.billed).map((row) => row.id)),
    termDays,
  };
}

/** Siparişlerin tahsilatı faturaya bağlanır; bağın tutarı bağlama kuralından çıkar, fazla tahsilat hareketin bağlanmamış kalanıdır. */
async function allocateOrderPayments(db: Db, documentId: string, orderIds: readonly string[]): Promise<void> {
  const payments = (await new MoneyMovementService(db).listByOrders(orderIds)).filter(
    (movement) => movement.type === 'order_payment' && movement.direction === 'in',
  );
  for (const payment of payments) {
    const outcome = await allocateToDocument(db, { movementId: payment.id, documentId });
    if (outcome.status === 'invalid' && outcome.reason !== 'document_settled') {
      logger.warn({ documentId, movementId: payment.id, reason: outcome.reason }, 'satış faturası: tahsilat faturaya bağlanamadı');
    }
  }
}

/**
 * Onay bekleyen faturalar müşteri kaydından yeniden hesaplanır: eksik tamamlanınca liste onu eksiksiz gösterir ve onay açılır.
 * Yalnız değişen fatura yazılır.
 */
async function refreshAwaitingInvoices(db: Db, customerIds?: readonly string[]): Promise<number> {
  const invoices = new SalesInvoiceService(db);
  const awaiting = await invoices.listByStatus('awaiting_approval');
  if (awaiting.length === 0) return 0;
  const documentIds = awaiting.map((invoice) => invoice.documentId);
  const [all, ordersOf] = await Promise.all([
    new MoneyDocumentService(db).listByIds(documentIds),
    new MoneyDocumentOrderService(db).ordersOf(documentIds),
  ]);
  const documents = customerIds ? all.filter((document) => document.customerId && customerIds.includes(document.customerId)) : all;
  if (documents.length === 0) return 0;
  const reads = await readInvoiceInputs(
    db,
    documents.flatMap((document) => ordersOf.get(document.id) ?? []),
    documents.flatMap((document) => (document.customerId ? [document.customerId] : [])),
  );
  const missingOf = new Map(awaiting.map((invoice) => [invoice.documentId, invoice.missing]));
  let refreshed = 0;
  for (const document of documents) {
    if (!document.customerId) continue;
    try {
      const composed = composeInvoice(document.customerId, ordersOf.get(document.id) ?? [], reads, document.issuedOn);
      if (sameInvoice(document, missingOf.get(document.id) ?? [], composed)) continue;
      if (await invoices.refresh({ documentId: document.id, ...composed })) refreshed += 1;
    } catch (err) {
      await captureError(err, { source: SOURCES.backendCron, context: { job: SALES_INVOICE_OPEN_JOB, documentId: document.id } });
    }
  }
  return refreshed;
}

/** Kırılım alan alan karşılaştırılır, çünkü jsonb nesnenin anahtar sırasını korumaz. */
function sameInvoice(document: MoneyDocument, missing: readonly SalesInvoiceGap[], composed: ComposedInvoice): boolean {
  const lines = (vatLines: readonly DocumentVatLine[]) =>
    JSON.stringify(vatLines.map((line) => [line.vatRate, line.netCents, line.vatCents]));
  return (
    document.amountCents === composed.amountCents &&
    document.dueOn === composed.dueOn &&
    document.vatRegime === composed.vatRegime &&
    lines(document.vatLines) === lines(composed.vatLines) &&
    [...missing].sort().join() === [...composed.missing].sort().join()
  );
}
