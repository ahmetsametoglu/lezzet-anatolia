import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService,
  MoneyDocumentService,
  MoneyMovementService,
  PennylaneCursorService,
  PennylaneDocumentService,
  PennylaneQueueService,
  SupplierService,
  serviceDb,
} from '@lezzet/database';
import { mustDelete, purgeTestData } from '@lezzet/database/testing';
import type { PennylaneCursor } from '@lezzet/types';
import { allocateToDocument } from '../document';
import { syncInvoiceFeed } from './invoice-feed';
import { memoryPennylane } from './memory-pennylane.testkit';
import { processPennylaneQueueRow } from './queue';

/*
  Faturalarımızın Pennylane'deki açık kalanının fatura akışından tazelenmesi gerçek tablolar ve bellek içi Pennylane ile sınanır. Fatura
  akışının imleci küreseldir, test sonunda geri konur.
*/

const db = serviceDb();
const stamp = Date.now();
const STREAM = 'supplier_invoices';
const cursors = new PennylaneCursorService(db);
const queue = new PennylaneQueueService(db);
const mirrors = new PennylaneDocumentService(db);
let originalCursor: PennylaneCursor | null = null;

beforeAll(async () => {
  originalCursor = await cursors.find(STREAM);
});

afterAll(async () => {
  if (originalCursor) await cursors.save(STREAM, originalCursor.processedAt);
  else await mustDelete(db, 'pennylane_cursor', (q) => q.eq('stream', STREAM));
});

let twin: ReturnType<typeof memoryPennylane>;
let supplierId: string;
let created: { documentIds: string[]; supplierIds: string[]; accountIds: string[] };
const files = new Map<string, Uint8Array>();
const reader = { read: async (key: string) => files.get(key) ?? Promise.reject(new Error(`dosya yok: ${key}`)) };

beforeEach(async () => {
  twin = memoryPennylane();
  created = { documentIds: [], supplierIds: [], accountIds: [] };
  supplierId = (await new SupplierService(db).insert({ name: `Fournisseur ${stamp}-${Math.random()}`, country: 'FR' })).id;
  created.supplierIds.push(supplierId);
});

afterEach(async () => {
  await purgeTestData(db, created);
});

const processDocument = async (documentId: string) =>
  processPennylaneQueueRow(db, twin.port, (await queue.findByDocument(documentId))!, { now: new Date(), files: reader });
/** Yüklenmiş muaf fatura; akış yüklemeden sonraki andan okunur. */
const uploaded = async (amountCents: number) => {
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
  });
  created.documentIds.push(row.id);
  const key = `finance/documents/${row.id}/belge.pdf`;
  files.set(key, new TextEncoder().encode(row.id));
  await documents.update({ id: row.id, fileKey: key });
  expect(await processDocument(row.id)).toBe('uploaded');
  await cursors.save(STREAM, twin.now());
  return { id: row.id, invoiceId: (await mirrors.findByDocument(row.id))!.pennylaneInvoiceId };
};
const feed = () => syncInvoiceFeed(db, twin.port, { now: new Date(twin.now()) });
const alerts = async (documentId: string) => {
  const { data, error } = await db.from('notification').select('id, payload').eq('kind', 'pennylane_document_different');
  if (error) throw error;
  return ((data ?? []) as Array<{ payload: { documentId?: string } }>).filter((row) => row.payload.documentId === documentId);
};

describe("faturalarımızın Pennylane'deki açık kalanı", () => {
  it("Pennylane'de başka hesaptan eşlenen faturamızın kalanı akıştan okunur; ayrılan belge için muhasebe kalan çifti başına bir kez uyarılır", async () => {
    const invoice = await uploaded(16_550);
    // Toptan operasyonunun hesabından Pennylane'de yapılan eşleşme bizim banka akışımıza girmez.
    const wholesale = twin.addBankAccount('Crédit Mutuel');
    const transactionId = twin.add({ bankAccountId: wholesale, date: '2026-10-02', label: 'VIR', direction: 'out', amountCents: 5_000 });
    await twin.port.matchTransaction({ invoiceId: invoice.invoiceId, transactionId });

    expect(await feed()).toMatchObject({ refreshed: 1 });
    expect(await mirrors.findByDocument(invoice.id)).toMatchObject({ pennylaneOpenCents: 11_550 });
    const first = (await alerts(invoice.id)).length;
    expect(first).toBeGreaterThan(0);

    // Eşleşme çözülüp yeniden kurulunca kalanlar aynı çifte döner; ikinci haber olmaz.
    await twin.port.unmatchTransaction({ invoiceId: invoice.invoiceId, transactionId });
    await feed();
    expect(await mirrors.findByDocument(invoice.id)).toMatchObject({ pennylaneOpenCents: 16_550 });
    await twin.port.matchTransaction({ invoiceId: invoice.invoiceId, transactionId });
    await feed();
    expect((await alerts(invoice.id)).length).toBe(first);
  });

  it("kuyrukta bekleyen belge karşılaştırılmaz; bizdeki değişiklik henüz Pennylane'e yazılmadı", async () => {
    const invoice = await uploaded(16_550);
    const { error } = await db.from('pennylane_queue').insert({ document_id: invoice.id });
    if (error) throw error;
    const wholesale = twin.addBankAccount('Crédit Mutuel');
    const transactionId = twin.add({ bankAccountId: wholesale, date: '2026-10-02', label: 'VIR', direction: 'out', amountCents: 5_000 });
    await twin.port.matchTransaction({ invoiceId: invoice.invoiceId, transactionId });

    await feed();
    expect(await mirrors.findByDocument(invoice.id)).toMatchObject({ pennylaneOpenCents: 11_550 });
    expect(await alerts(invoice.id)).toEqual([]);
  });

  it("nakitle ödenen belgenin kalanı Pennylane'de düşmese de uyarı olmaz", async () => {
    const invoice = await uploaded(16_550);
    const cash = (await new AccountService(db).insert({ name: `Kasa ${stamp}-${Math.random()}`, type: 'cash' })).id;
    created.accountIds.push(cash);
    const payment = await new MoneyMovementService(db).insert({
      accountId: cash,
      direction: 'out',
      amountCents: 16_550,
      type: 'purchase',
      supplierId,
      valueDate: '2026-10-02',
    });
    await allocateToDocument(db, { movementId: payment.id, documentId: invoice.id });
    expect(await processDocument(invoice.id)).toBe('paid');

    expect(await feed()).toMatchObject({ refreshed: 1 });
    expect(await mirrors.findByDocument(invoice.id)).toMatchObject({ paymentStatus: 'paid', pennylaneOpenCents: 16_550 });
    expect(await alerts(invoice.id)).toEqual([]);
  });
});
