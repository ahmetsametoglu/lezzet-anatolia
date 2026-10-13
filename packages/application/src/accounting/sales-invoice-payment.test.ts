import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { MoneyDocumentService, MoneyMovementService, OrderService, SalesInvoiceService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { SYSTEM_ACCOUNT_IDS, type MoneyMovement } from '@lezzet/types';
import { syncOrderPaymentStatus } from '../order/payment';
import { openSalesInvoices } from './sales-invoice';
import { ordersFundedBy, settleSalesInvoice } from './sales-invoice-payment';
import { salesInvoiceGround } from './sales-invoice.testkit';

/*
  Havalenin satış faturasına mahsubu gerçek tablolarla sınanır: ara hesaptaki tahsilat, faturaya bağı, siparişin ödeme durumu ve geri
  alma. Fatura Pennylane'den geçmeden kesilmiş sayılır, çünkü sınanan kesim değil mahsuptur.
*/

const db = serviceDb();
const NOW = new Date('2026-10-12T08:00:00Z');
const documents = new MoneyDocumentService(db);
const movements = new MoneyMovementService(db);
const orders = new OrderService(db);
let ground: Awaited<ReturnType<typeof salesInvoiceGround>>;
let issued = 0;

beforeAll(async () => {
  ground = await salesInvoiceGround(db);
});

afterEach(async () => {
  await purgeTestData(db, { profileIds: ground.created.profileIds.splice(0) });
});

afterAll(async () => {
  await purgeTestData(db, ground.created);
});

/** Müşterinin faturaları, kesilmiş olarak; ay sonu müşterisinde satışlar tek faturada toplanır. */
async function issuedInvoices(customerId: string, orderIds: readonly string[]): Promise<string[]> {
  await openSalesInvoices(db, { now: NOW, customerIds: [customerId] });
  const { data, error } = await db
    .from('money_document_order')
    .select('document_id')
    .in('order_id', [...orderIds]);
  if (error) throw error;
  const ids = [...new Set((data as Array<{ document_id: string }>).map((row) => row.document_id))];
  for (const documentId of ids) {
    issued += 1;
    await new SalesInvoiceService(db).issue({
      documentId,
      pennylaneInvoiceId: Date.now() * 100 + issued,
      number: `F-MAHSUP-${Date.now()}-${issued}`,
      issuedOn: '2026-10-12',
      dueOn: '2026-11-11',
    });
  }
  return ids;
}

/** Ekstreden gelmiş, karşılığı olmayan giriş satırı. */
function statementRow(amountCents: number): Promise<MoneyMovement> {
  issued += 1;
  return movements.insert({
    accountId: ground.accountId,
    direction: 'in',
    amountCents,
    type: 'misc',
    valueDate: '2026-10-14',
    description: 'VIR RESTAURANT OBERJAEGERHOF',
    source: 'bank_import',
    importFingerprint: `mahsup-${Date.now()}-${issued}`,
  });
}

const openOf = async (documentId: string) => (await documents.balances([documentId])).get(documentId)?.openAmountCents;
const statusOf = async (orderId: string) => (await orders.getById(orderId))?.paymentStatus;
const amountOf = async (documentId: string) => (await documents.getById(documentId))!.amountCents;

describe('havalenin satış faturasına mahsubu', () => {
  // Para ara hesapta iki kez sayılsaydı ya da sipariş tahsilatı yazılmasaydı fatura ödenmiş, sipariş borçlu görünürdü.
  it('havale faturayı kapatır: siparişler ödenir, satır ara hesaba transfer olur ve ara hesap sıfırlanır', async () => {
    const customer = await ground.company({ invoiceMode: 'month_end' });
    const first = await ground.sale(customer.id, { soldOn: '2026-09-10', qty: 2 });
    const second = await ground.sale(customer.id, { soldOn: '2026-09-22', qty: 1 });
    const [documentId] = await issuedInvoices(customer.id, [first.id, second.id]);
    const row = await statementRow(await amountOf(documentId!));

    expect(await settleSalesInvoice(db, { movement: row, documentId: documentId! })).toMatchObject({ status: 'ok', remainingCents: 0 });
    expect(await openOf(documentId!)).toBe(0);
    expect([await statusOf(first.id), await statusOf(second.id)]).toEqual(['paid', 'paid']);
    expect(await movements.getById(row.id)).toMatchObject({
      type: 'transfer',
      counterAccountId: SYSTEM_ACCOUNT_IDS.invoice_clearing,
      reconciled: true,
    });

    const payments = await movements.listFundedBy([row.id]);
    expect(payments.map((payment) => payment.accountId)).toEqual([
      SYSTEM_ACCOUNT_IDS.invoice_clearing,
      SYSTEM_ACCOUNT_IDS.invoice_clearing,
    ]);
    const clearingRows = (await Promise.all([row, ...payments].map((movement) => movements.ledgerRows(movement.id))))
      .flat()
      .filter((ledger) => ledger.ledgerAccountId === SYSTEM_ACCOUNT_IDS.invoice_clearing);
    expect(clearingRows.reduce((sum, ledger) => sum + ledger.signedAmountCents, 0)).toBe(0);
  });

  // Dağıtım sırası değişseydi kısmi ödemede hangi teslimin kapandığı her seferinde başka olurdu.
  it('kısmi havale en eski siparişi önce kapatır, fatura açığıyla kalır', async () => {
    const customer = await ground.company({ invoiceMode: 'month_end' });
    const older = await ground.sale(customer.id, { soldOn: '2026-09-08', qty: 1 });
    const newer = await ground.sale(customer.id, { soldOn: '2026-09-25', qty: 1 });
    const [documentId] = await issuedInvoices(customer.id, [older.id, newer.id]);
    const half = (await amountOf(documentId!)) / 2;
    const row = await statementRow(half);

    expect(await settleSalesInvoice(db, { movement: row, documentId: documentId! })).toMatchObject({ status: 'ok', remainingCents: 0 });
    expect([await statusOf(older.id), await statusOf(newer.id)]).toEqual(['paid', 'pending']);
    expect(await openOf(documentId!)).toBe(half);
  });

  // Kalan kuyrukta durmasaydı fazla gelen para hiçbir yerde görünmez, ikinci fatura da bu havaleye bağlanamazdı.
  it('fazla havale kalanıyla kuyrukta durur; kalan ikinci faturaya bağlanınca satır mutabık olur', async () => {
    const customer = await ground.company();
    const a = await ground.sale(customer.id, { soldOn: '2026-10-05', qty: 1 });
    const b = await ground.sale(customer.id, { soldOn: '2026-10-06', qty: 3 });
    const [first, second] = await issuedInvoices(customer.id, [a.id, b.id]);
    const firstAmount = await amountOf(first!);
    const secondAmount = await amountOf(second!);
    const row = await statementRow(firstAmount + secondAmount);

    expect(await settleSalesInvoice(db, { movement: row, documentId: first! })).toMatchObject({
      status: 'ok',
      remainingCents: secondAmount,
    });
    const partial = (await movements.getById(row.id))!;
    expect(partial).toMatchObject({ type: 'transfer', reconciled: false });
    expect(await settleSalesInvoice(db, { movement: partial, documentId: first! })).toEqual({
      status: 'invalid',
      reason: 'already_allocated',
    });

    expect(await settleSalesInvoice(db, { movement: partial, documentId: second! })).toMatchObject({ status: 'ok', remainingCents: 0 });
    expect(await movements.getById(row.id)).toMatchObject({ reconciled: true });
    expect([await openOf(first!), await openOf(second!)]).toEqual([0, 0]);
  });

  // Geri alma tahsilatı silmeseydi sipariş ödenmiş, satır ise karşılıksız kalır ve para iki kez sayılırdı.
  it('eşleşme geri alınınca ara hesaptaki tahsilatlar silinir, sipariş ödenmemişe döner, fatura açılır', async () => {
    const customer = await ground.company();
    const sale = await ground.sale(customer.id, { soldOn: '2026-10-05', qty: 2 });
    const [documentId] = await issuedInvoices(customer.id, [sale.id]);
    const amount = await amountOf(documentId!);
    const row = await statementRow(amount);
    await settleSalesInvoice(db, { movement: row, documentId: documentId! });

    const funded = await ordersFundedBy(db, row.id);
    await movements.unmatchBankMovement(row.id);
    for (const orderId of funded) await syncOrderPaymentStatus(db, orderId);

    expect(funded).toEqual([sale.id]);
    expect(await movements.listFundedBy([row.id])).toEqual([]);
    expect(await movements.getById(row.id)).toMatchObject({ type: 'misc', counterAccountId: null, reconciled: false });
    expect(await statusOf(sale.id)).toBe('pending');
    expect(await openOf(documentId!)).toBe(amount);
  });

  // Kesilmemiş fatura müşteriye gitmemiştir; havalesi ona bağlansaydı numarasız bir borç kapanırdı.
  it('kesilmemiş satış faturasına mahsup yazılmaz', async () => {
    const customer = await ground.company();
    const sale = await ground.sale(customer.id, { soldOn: '2026-10-05', qty: 1 });
    await openSalesInvoices(db, { now: NOW, customerIds: [customer.id] });
    const { data, error } = await db.from('money_document_order').select('document_id').eq('order_id', sale.id).single();
    if (error) throw error;
    const row = await statementRow(500);

    expect(await settleSalesInvoice(db, { movement: row, documentId: (data as { document_id: string }).document_id })).toEqual({
      status: 'invalid',
      reason: 'not_issued',
    });
  });
});
