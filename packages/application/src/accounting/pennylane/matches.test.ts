import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService,
  MoneyAllocationService,
  MoneyDocumentService,
  MoneyMovementService,
  OrderService,
  PennylaneBankAccountService,
  PennylaneCursorService,
  PennylaneDocumentService,
  PennylaneMatchRemovedService,
  PennylaneQueueService,
  PennylaneTransactionService,
  SalesInvoiceService,
  SupplierService,
  serviceDb,
} from '@lezzet/database';
import { mustDelete, purgeTestData } from '@lezzet/database/testing';
import type { MoneyDocumentInsert, PennylaneCursor } from '@lezzet/types';
import { allocateToDocument } from '../document';
import { openSalesInvoices } from '../sales-invoice';
import { settleSalesInvoice } from '../sales-invoice-payment';
import { salesInvoiceGround } from '../sales-invoice.testkit';
import { mapPennylaneBankAccount, syncBankFeed } from './bank-feed';
import { memoryPennylane } from './memory-pennylane.testkit';
import { processPennylaneQueueRow } from './queue';

/*
  Banka satırının Pennylane eşleşmesi gerçek tablolar, bellek içi Pennylane ve banka akışıyla sınanır. Akış imleci küreseldir, test
  sonunda geri konur; kuyruk küresel olduğu için testler yalnız kendi satırlarını işler.
*/

const db = serviceDb();
const stamp = Date.now();
const cursors = new PennylaneCursorService(db);
const queue = new PennylaneQueueService(db);
const mirrors = new PennylaneDocumentService(db);
const allocations = new MoneyAllocationService(db);
let originalCursor: PennylaneCursor | null = null;

beforeAll(async () => {
  originalCursor = await cursors.find('transactions');
});

afterAll(async () => {
  if (originalCursor) await cursors.save('transactions', originalCursor.processedAt);
  else await mustDelete(db, 'pennylane_cursor', (q) => q.eq('stream', 'transactions'));
});

let twin: ReturnType<typeof memoryPennylane>;
let bank: number;
let accountId: string;
let supplierId: string;
let created: { documentIds: string[]; supplierIds: string[]; accountIds: string[] };
let twinAccounts: number[];
const files = new Map<string, Uint8Array>();
const reader = { read: async (key: string) => files.get(key) ?? Promise.reject(new Error(`dosya yok: ${key}`)) };

beforeEach(async () => {
  await cursors.save('transactions', '2000-01-01T00:00:00Z');
  created = { documentIds: [], supplierIds: [], accountIds: [] };
  twin = memoryPennylane();
  bank = twin.addBankAccount('Banque');
  twinAccounts = [bank];
  accountId = (await new AccountService(db).insert({ name: `Pennylane eşleşme ${stamp}-${Math.random()}`, type: 'bank' })).id;
  created.accountIds.push(accountId);
  await new PennylaneBankAccountService(db).saveSeen(await twin.port.listBankAccounts(), twin.now());
  expect(await mapPennylaneBankAccount(db, { accountId, pennylaneId: bank }, { now: new Date(twin.now()) })).toEqual({ status: 'ok' });
  supplierId = (await new SupplierService(db).insert({ name: `Fournisseur ${stamp}-${Math.random()}`, country: 'FR' })).id;
  created.supplierIds.push(supplierId);
});

afterEach(async () => {
  await mustDelete(db, 'pennylane_bank_account', (q) => q.in('pennylane_id', twinAccounts));
  await purgeTestData(db, created);
});

const ctx = () => ({ now: new Date(), files: reader });
const processDocument = async (documentId: string) =>
  processPennylaneQueueRow(db, twin.port, (await queue.findByDocument(documentId))!, ctx());
const processMovement = async (movementId: string) => {
  const row = await queue.findByMovement(movementId);
  return row ? processPennylaneQueueRow(db, twin.port, row, ctx()) : 'not_queued';
};
const sync = () => syncBankFeed(db, twin.port, { now: new Date(twin.now()) });

/** Ödeyeceğimiz muaf fatura; dosyası bağlanıp yüklenir, yükleme istenmezse dosyasız kalır. */
const document = async (amountCents: number, opts: { upload?: boolean } = {}, over: Partial<MoneyDocumentInsert> = {}) => {
  const documents = new MoneyDocumentService(db);
  const row = await documents.insert({
    kind: 'invoice',
    business: 'lezzet',
    direction: 'out',
    number: `F-${stamp}-${created.documentIds.length + 1}`,
    issuedOn: '2026-10-02',
    supplierId,
    amountCents,
    vatRegime: 'exempt',
    ...over,
  });
  created.documentIds.push(row.id);
  if (opts.upload === false) return { id: row.id, invoiceId: null };
  const key = `finance/documents/${row.id}/belge.pdf`;
  files.set(key, new TextEncoder().encode(row.id));
  await documents.update({ id: row.id, fileKey: key });
  expect(await processDocument(row.id)).toBe('uploaded');
  return { id: row.id, invoiceId: (await mirrors.findByDocument(row.id))!.pennylaneInvoiceId };
};
/** Pennylane'den gelen çıkış hareketi ve bizdeki banka satırı. */
const bankRow = async (amountCents: number) => {
  const transactionId = twin.add({ bankAccountId: bank, date: '2026-10-02', label: 'VIR FOURNISSEUR', direction: 'out', amountCents });
  await sync();
  const movementId = (await new PennylaneTransactionService(db).findByPennylaneId(transactionId))!.movementId!;
  return { transactionId, movementId };
};
const alerts = async (kind: string, movementId: string) => {
  const { data, error } = await db.from('notification').select('payload').eq('kind', kind);
  if (error) throw error;
  return ((data ?? []) as Array<{ payload: { movementId?: string } }>).filter((row) => row.payload.movementId === movementId);
};

describe("bizdeki bağın Pennylane'e yazımı", () => {
  it("kurulan bağ Pennylane'e yazılır; bağ silinince Pennylane'de de çözülür", async () => {
    const invoice = await document(16_550);
    const { transactionId, movementId } = await bankRow(16_550);
    expect(await allocateToDocument(db, { movementId, documentId: invoice.id })).toMatchObject({ status: 'ok' });
    expect(await processMovement(movementId)).toBe('matched');
    expect(twin.matchesOf(transactionId)).toEqual([invoice.invoiceId]);

    // Bizdeki değişiklik yazılmadan Pennylane'den gelen olay çözülen bağı geri benimsemez.
    await allocations.remove(movementId, invoice.id);
    twin.change(transactionId, { label: 'VIR FOURNISSEUR 2' });
    await sync();
    expect(await allocations.listByMovements([movementId])).toEqual([]);
    expect(await processMovement(movementId)).toBe('matched');
    expect(twin.matchesOf(transactionId)).toEqual([]);
  });

  it('belge sonradan yüklenince bağı da yazılır', async () => {
    const invoice = await document(16_550, { upload: false });
    const { transactionId, movementId } = await bankRow(16_550);
    await allocateToDocument(db, { movementId, documentId: invoice.id });
    expect(await queue.findByMovement(movementId)).toBeNull();

    const key = `finance/documents/${invoice.id}/belge.pdf`;
    files.set(key, new TextEncoder().encode(invoice.id));
    await new MoneyDocumentService(db).update({ id: invoice.id, fileKey: key });
    await processDocument(invoice.id);
    expect(await processMovement(movementId)).toBe('matched');
    expect(twin.matchesOf(transactionId)).toEqual([(await mirrors.findByDocument(invoice.id))!.pennylaneInvoiceId]);
  });

  it('elle yazılan ödeme banka satırına katılınca bağı eşleşme olur ve nakit işareti kalkar; birleşme geri alınınca ikisi de döner', async () => {
    const invoice = await document(16_550);
    const movements = new MoneyMovementService(db);
    const manual = await movements.insert({
      accountId,
      direction: 'out',
      amountCents: 16_550,
      type: 'purchase',
      supplierId,
      valueDate: '2026-10-02',
    });
    await allocateToDocument(db, { movementId: manual.id, documentId: invoice.id });
    expect(await processDocument(invoice.id)).toBe('paid');
    const paymentStatus = () => twin.invoices().find((row) => row.id === invoice.invoiceId)?.paymentStatus;

    // "Zaten yazmıştım": birleşme bağı elle yazılan satırdan banka satırına taşır.
    const { transactionId, movementId } = await bankRow(16_550);
    await movements.absorbProvisional(movementId, manual.id);
    expect(await processMovement(movementId)).toBe('matched');
    expect(twin.matchesOf(transactionId)).toEqual([invoice.invoiceId]);
    await processDocument(invoice.id);
    expect(paymentStatus()).toBe('to_be_paid');

    await movements.unmatchBankMovement(movementId);
    expect(await processMovement(movementId)).toBe('matched');
    expect(twin.matchesOf(transactionId)).toEqual([]);
    await processDocument(invoice.id);
    expect(paymentStatus()).toBe('paid');
  });
});

describe('bizde olmayan fatura', () => {
  it('bizde olmayan faturaya eşli hareket izah bekler; bağımız yanına eklenir, çıkan bağımız varsa hareket bekler ve muhasebe uyarılır', async () => {
    const { transactionId, movementId } = await bankRow(20_000);
    const foreign = twin.addForeignInvoice({ supplierId: 1, invoiceNumber: 'G-1', grossCents: 5_000 });
    await twin.port.matchTransaction({ kind: 'supplier', invoiceId: foreign, transactionId });
    await sync();
    expect(await new MoneyMovementService(db).getById(movementId)).toMatchObject({ matchedElsewhere: true, explained: false });

    const invoice = await document(15_000);
    await allocateToDocument(db, { movementId, documentId: invoice.id });
    expect(await new MoneyMovementService(db).getById(movementId)).toMatchObject({ matchedElsewhere: true, explained: true });
    expect(await processMovement(movementId)).toBe('matched');
    expect(twin.matchesOf(transactionId)).toEqual([foreign, invoice.invoiceId].sort((a, b) => a! - b!));

    await allocations.remove(movementId, invoice.id);
    expect(await processMovement(movementId)).toBe('blocked');
    expect(await queue.findByMovement(movementId)).toMatchObject({ lastError: 'blocked:foreign_matches' });
    expect(twin.matchesOf(transactionId)).toContain(foreign);
    expect((await alerts('pennylane_match_stuck', movementId)).length).toBeGreaterThan(0);
  });
});

describe("Pennylane'de kurulan ve çözülen eşleşme", () => {
  it("bizim faturamıza Pennylane'de kurulan eşleşme benimsenir; çözülen bağ bizde silinmez, yeniden yazılmaz, muhasebe uyarılır", async () => {
    const invoice = await document(16_550);
    const { transactionId, movementId } = await bankRow(16_550);
    await twin.port.matchTransaction({ kind: 'supplier', invoiceId: invoice.invoiceId!, transactionId });
    await sync();
    const [allocation] = await allocations.listByMovements([movementId]);
    expect(allocation).toMatchObject({ documentId: invoice.id, amountCents: 16_550 });
    // Benimsenen bağ operatörün bağıyla aynı cevabı verir: satır tedarikçi ödemesi olur ve tedarikçi borcu kapanır.
    expect(await new MoneyMovementService(db).getById(movementId)).toMatchObject({ supplierId, type: 'purchase', reconciled: true });
    expect((await new SupplierService(db).debt(supplierId)).balanceCents).toBe(0);
    expect(await processMovement(movementId)).toBe('unchanged');

    await twin.port.unmatchTransaction({ kind: 'supplier', invoiceId: invoice.invoiceId!, transactionId });
    await sync();
    expect(await new PennylaneMatchRemovedService(db).listByAllocations([allocation!.id])).toHaveLength(1);
    expect(await allocations.listByMovements([movementId])).toHaveLength(1);
    expect((await alerts('pennylane_match_removed', movementId)).length).toBeGreaterThan(0);

    const { error } = await db.from('pennylane_queue').insert({ movement_id: movementId });
    if (error) throw error;
    expect(await processMovement(movementId)).toBe('unchanged');
    expect(twin.matchesOf(transactionId)).toEqual([]);
  });

  it('Pennylane açılma sırasıyla dağıttığı için iki faturayı kısmen kapatan hareketin kalanı bizimkinden ayrılır ve aynada durur', async () => {
    const older = await document(6_000);
    const newer = await document(6_000);
    const { movementId } = await bankRow(10_000);
    await allocateToDocument(db, { movementId, documentId: newer.id });
    await allocateToDocument(db, { movementId, documentId: older.id });
    expect(await processMovement(movementId)).toBe('matched');

    const balances = await new MoneyDocumentService(db).balances([older.id, newer.id]);
    expect([balances.get(newer.id)?.openAmountCents, balances.get(older.id)?.openAmountCents]).toEqual([0, 2_000]);
    expect([
      (await mirrors.findByDocument(newer.id))?.pennylaneOpenCents,
      (await mirrors.findByDocument(older.id))?.pennylaneOpenCents,
    ]).toEqual([2_000, 0]);
  });
});

describe('satış faturasının havalesi', () => {
  let ground: Awaited<ReturnType<typeof salesInvoiceGround>>;

  beforeAll(async () => {
    ground = await salesInvoiceGround(db);
  });

  afterEach(async () => {
    await purgeTestData(db, { profileIds: ground.created.profileIds.splice(0) });
  });

  afterAll(async () => {
    await purgeTestData(db, ground.created);
  });

  /** Pennylane'de kesilmiş satış faturası ve siparişi; e-postası PDF beklediği için kesim turunda kalır. */
  const issuedInvoice = async () => {
    const customer = await ground.company();
    const order = await ground.sale(customer.id, { soldOn: '2026-10-05', qty: 2 });
    await openSalesInvoices(db, { now: new Date('2026-10-12T08:00:00Z'), customerIds: [customer.id] });
    const { data, error } = await db.from('money_document_order').select('document_id').eq('order_id', order.id).single();
    if (error) throw error;
    const documentId = (data as { document_id: string }).document_id;
    await processDocument(documentId);
    const invoice = (await new SalesInvoiceService(db).findByDocument(documentId))!;
    expect(invoice).toMatchObject({ status: 'issued' });
    return {
      order,
      documentId,
      pennylaneInvoiceId: invoice.pennylaneInvoiceId!,
      amountCents: (await new MoneyDocumentService(db).getById(documentId))!.amountCents,
    };
  };
  /** Pennylane'den gelen müşteri havalesi ve bizdeki banka satırı. */
  const incoming = async (amountCents: number) => {
    const transactionId = twin.add({ bankAccountId: bank, date: '2026-10-14', label: 'VIR RESTAURANT', direction: 'in', amountCents });
    await sync();
    return { transactionId, movementId: (await new PennylaneTransactionService(db).findByPennylaneId(transactionId))!.movementId! };
  };

  // Mahsup Pennylane'e yazılmasaydı müşteri faturası orada açık kalır, muhasebeciye ödenmemiş görünürdü.
  it("mahsup edilen havale Pennylane'de müşteri faturasına eşlenir; eşleşme geri alınınca orada da çözülür", async () => {
    const invoice = await issuedInvoice();
    const { transactionId, movementId } = await incoming(invoice.amountCents);
    const movement = (await new MoneyMovementService(db).getById(movementId))!;
    expect(await settleSalesInvoice(db, { movement, documentId: invoice.documentId })).toMatchObject({ status: 'ok' });

    expect(await processMovement(movementId)).toBe('matched');
    expect(twin.matchesOf(transactionId)).toEqual([invoice.pennylaneInvoiceId]);
    expect(await twin.port.transactionMatches(transactionId)).toEqual([{ kind: 'customer', invoiceId: invoice.pennylaneInvoiceId }]);

    await new MoneyMovementService(db).unmatchBankMovement(movementId);
    expect(await processMovement(movementId)).toBe('matched');
    expect(twin.matchesOf(transactionId)).toEqual([]);
  });

  // Benimsenmeseydi Pennylane'de ödenmiş fatura bizde açık, satır "başka yerde eşli" kalır ve sipariş borçlu görünürdü.
  it("Pennylane'de müşteri faturasına kurulan eşleşme bizde mahsup olarak benimsenir", async () => {
    const invoice = await issuedInvoice();
    const { transactionId, movementId } = await incoming(invoice.amountCents);
    await twin.port.matchTransaction({ kind: 'customer', invoiceId: invoice.pennylaneInvoiceId, transactionId });
    await sync();

    expect(await new MoneyMovementService(db).getById(movementId)).toMatchObject({
      type: 'transfer',
      reconciled: true,
      matchedElsewhere: false,
    });
    expect((await new OrderService(db).getById(invoice.order.id))?.paymentStatus).toBe('paid');
    expect((await new MoneyDocumentService(db).balances([invoice.documentId])).get(invoice.documentId)?.openAmountCents).toBe(0);
    expect(await processMovement(movementId)).toBe('unchanged');
  });
});
