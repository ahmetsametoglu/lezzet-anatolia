import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService,
  CounterpartyService,
  MoneyAllocationService,
  MoneyDocumentService,
  MoneyMovementService,
  PennylaneDocumentService,
  PennylaneQueueService,
  SupplierService,
  serviceDb,
} from '@lezzet/database';
import { mustDelete, purgeTestData } from '@lezzet/database/testing';
import type { MoneyDocumentInsert } from '@lezzet/types';
import { processPennylaneDocumentRow } from './documents';
import { PennylaneError } from './errors';
import { memoryPennylane } from './memory-pennylane.testkit';

/*
  Alış belgesinin Pennylane'e yazımı gerçek tablolar, bellek içi Pennylane ve bellek içi dosya kaynağıyla sınanır. Kuyruk küresel olduğu
  için testler yalnız kendi belgelerinin satırını işler.
*/

const db = serviceDb();
const stamp = Date.now();
const documents = new MoneyDocumentService(db);
const queue = new PennylaneQueueService(db);
const mirrors = new PennylaneDocumentService(db);
const LIVE_FROM = '2026-10-01';

let twin: ReturnType<typeof memoryPennylane>;
let files: Map<string, Uint8Array>;
let created: { documentIds: string[]; supplierIds: string[]; counterpartyIds: string[]; accountIds: string[] };
let supplierId: string;

beforeEach(async () => {
  twin = memoryPennylane();
  files = new Map();
  created = { documentIds: [], supplierIds: [], counterpartyIds: [], accountIds: [] };
  supplierId = (await new SupplierService(db).insert({ name: `Fournisseur ${stamp}-${Math.random()}`, country: 'FR', paymentTermDays: 30 }))
    .id;
  created.supplierIds.push(supplierId);
});

afterEach(async () => {
  await purgeTestData(db, created);
});

const reader = { read: async (key: string) => files.get(key) ?? Promise.reject(new Error(`dosya yok: ${key}`)) };
const run = async (documentId: string, now = new Date()) => {
  const row = await queue.findByDocument(documentId);
  return row ? processPennylaneDocumentRow(db, twin.port, row, { liveFrom: LIVE_FROM, now, files: reader }) : 'not_queued';
};
const fileOf = (documentId: string, content = documentId, extension = 'pdf') => {
  const key = `finance/documents/${documentId}/belge.${extension}`;
  files.set(key, new TextEncoder().encode(content));
  return key;
};
/** Ödeyeceğimiz iki oranlı fatura, dosyasıyla; dosya belgeden sonra bağlanır, ekrandaki sırayla. */
const invoice = async (over: Partial<MoneyDocumentInsert> = {}, file: { content?: string; extension?: string } | null = {}) => {
  const row = await documents.insert({
    kind: 'invoice',
    direction: 'out',
    number: `F-${stamp}-${created.documentIds.length + 1}`,
    issuedOn: '2026-10-02',
    dueOn: '2026-11-01',
    supplierId,
    amountCents: 16_550,
    vatLines: [
      { vatRate: 5.5, netCents: 10_000, vatCents: 550 },
      { vatRate: 20, netCents: 5_000, vatCents: 1_000 },
    ],
    ...over,
  });
  created.documentIds.push(row.id);
  if (file) await documents.update({ id: row.id, fileKey: fileOf(row.id, file.content, file.extension) });
  return row;
};
const stuckAlerts = async (documentId: string) => {
  const { data, error } = await db.from('notification').select('payload').eq('kind', 'pennylane_document_stuck');
  if (error) throw error;
  return ((data ?? []) as Array<{ payload: { documentId?: string; reason?: string } }>).filter(
    (row) => row.payload.documentId === documentId,
  );
};

describe('alış belgesinin Pennylane yüklemesi', () => {
  it('fatura tedarikçisiyle birlikte bir kez yüklenir; yeniden işaretlenince ikinci kez yüklenmez, tedarikçi ikinci kez açılmaz', async () => {
    const doc = await invoice();
    expect(await run(doc.id)).toBe('uploaded');
    expect(twin.suppliers()).toMatchObject([{ externalReference: `sup:${supplierId}`, dueDays: 30 }]);
    expect(twin.invoices()).toMatchObject([
      {
        supplierId: twin.suppliers()[0]!.id,
        date: '2026-10-02',
        deadline: '2026-11-01',
        invoiceNumber: doc.number,
        externalReference: `doc:${doc.id}`,
        lines: [
          { grossCents: 10_550, vatCents: 550, vatCode: 'FR_55' },
          { grossCents: 6_000, vatCents: 1_000, vatCode: 'FR_200' },
        ],
      },
    ]);
    expect(await queue.findByDocument(doc.id)).toBeNull();

    await documents.update({ id: doc.id, dueOn: '2026-11-01' });
    expect(await run(doc.id)).toBe('unchanged');
    // Tedarikçinin aynası yazılmadan kalsa da dış referansla bulunur.
    await mustDelete(db, 'pennylane_supplier', (q) => q.eq('supplier_id', supplierId));
    const second = await invoice();
    expect(await run(second.id)).toBe('uploaded');
    expect(twin.suppliers()).toHaveLength(1);
    expect(twin.invoices()).toHaveLength(2);
  });

  it('karşı tarafı cari olan belge carinin dış referansıyla açılan tedarikçiye yüklenir; muaf belge tek exempt satırıyla gider', async () => {
    const counterpartyId = (await new CounterpartyService(db).insert({ name: `Bailleur ${stamp}` })).id;
    created.counterpartyIds.push(counterpartyId);
    const rent = await invoice({ supplierId: null, counterpartyId, vatRegime: 'exempt', vatLines: [], amountCents: 90_000 });
    expect(await run(rent.id)).toBe('uploaded');
    expect(twin.suppliers()).toMatchObject([{ externalReference: `cp:${counterpartyId}`, vatNumber: null, dueDays: null }]);
    expect(twin.invoices()[0]!.lines).toEqual([{ grossCents: 90_000, vatCents: 0, vatCode: 'exempt' }]);
  });

  it('yarıda kalan yükleme dış referansla bulunur: aynası yazılmadan kalan belge ikinci kez yüklenmez', async () => {
    const doc = await invoice();
    await run(doc.id);
    const invoiceId = twin.invoices()[0]!.id;
    await mustDelete(db, 'pennylane_document', (q) => q.eq('document_id', doc.id));
    await documents.update({ id: doc.id, dueOn: '2026-11-01' });

    expect(await run(doc.id)).toBe('uploaded');
    expect(twin.invoices()).toHaveLength(1);
    expect(await mirrors.findByDocument(doc.id)).toMatchObject({ pennylaneInvoiceId: invoiceId });
  });

  it('yüklenmiş belgenin tutarı ve numarası değişince Pennylane güncellenir, dosya yeniden yüklenmez', async () => {
    const doc = await invoice();
    await run(doc.id);
    await documents.update({
      id: doc.id,
      number: `${doc.number}-B`,
      amountCents: 36_000,
      vatLines: [{ vatRate: 20, netCents: 30_000, vatCents: 6_000 }],
    });

    expect(await run(doc.id)).toBe('updated');
    expect(twin.invoices()).toMatchObject([
      { invoiceNumber: `${doc.number}-B`, lines: [{ grossCents: 36_000, vatCents: 6_000, vatCode: 'FR_200' }] },
    ]);
    expect(twin.invoices()[0]!.fileId).not.toBeNull();
    expect((await mirrors.findByDocument(doc.id))?.written.invoiceNumber).toBe(`${doc.number}-B`);
  });
});

describe('yazılamayan belge', () => {
  it('aynı tedarikçide aynı numaralı başka fatura varken yüklenmez; belge sebebiyle bekler ve muhasebe bir kez uyarılır', async () => {
    const reference = `sup:${supplierId}`;
    const pennylaneSupplier = await twin.port.createSupplier({
      name: 'Fournisseur',
      externalReference: reference,
      vatNumber: null,
      dueDays: null,
    });
    twin.addForeignInvoice({ supplierId: pennylaneSupplier.id, invoiceNumber: 'F-DUP-1' });
    const doc = await invoice({ number: 'F-DUP-1' });

    expect(await run(doc.id)).toBe('blocked');
    expect(await queue.findByDocument(doc.id)).toMatchObject({ lastError: 'blocked:duplicate_number' });
    // Haber muhasebe ve yönetimdeki her kişiye ayrı satırdır.
    const alerts = await stuckAlerts(doc.id);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.every((row) => row.payload.reason === 'duplicate_number')).toBe(true);

    // Seyrek yeniden deneme aynı sebeple durdukça haber tekrar etmez.
    expect(await run(doc.id, new Date(Date.now() + 7 * 3_600_000))).toBe('blocked');
    expect(await stuckAlerts(doc.id)).toHaveLength(alerts.length);
    expect(twin.invoices()).toHaveLength(1);
  });

  it("aynı dosya başka belgemizle yüklenmişse belge bekler; Pennylane'de başka kaynaktan duran aynı dosyanın faturası benimsenir", async () => {
    const first = await invoice({}, { content: 'ayni-tarama' });
    await run(first.id);
    const twinCopy = await invoice({}, { content: 'ayni-tarama' });
    expect(await run(twinCopy.id)).toBe('blocked');
    expect(await queue.findByDocument(twinCopy.id)).toMatchObject({ lastError: 'blocked:duplicate_file' });

    const foreignFile = await twin.port.uploadFile({
      bytes: new TextEncoder().encode('dis-kaynak'),
      contentType: 'application/pdf',
      filename: 'x.pdf',
    });
    const foreign = await twin.port.importInvoice({
      draft: { ...twin.invoices()[0]!, externalReference: 'baska:1', invoiceNumber: 'DIS-1' },
      fileId: foreignFile,
    });
    const adopted = await invoice({}, { content: 'dis-kaynak' });
    expect(await run(adopted.id)).toBe('uploaded');
    expect((await mirrors.findByDocument(adopted.id))?.pennylaneInvoiceId).toBe(foreign.status === 'imported' ? foreign.invoice.id : null);
  });

  it('dosyasız belge haber vermeden bekler, dosyası bağlanınca yüklenir', async () => {
    const doc = await invoice({}, null);
    expect(await run(doc.id)).toBe('blocked');
    expect(await stuckAlerts(doc.id)).toHaveLength(0);
    await documents.update({ id: doc.id, fileKey: fileOf(doc.id) });
    expect(await run(doc.id)).toBe('uploaded');
  });

  it('düşen yazım belgeyi kaybettirmez: satır ertelenir, sonraki denemede yüklenir', async () => {
    const doc = await invoice();
    twin.failNext('importInvoice', new PennylaneError({ code: 'provider', message: 'Pennylane sunucu hatası (502)' }));
    expect(await run(doc.id)).toBe('failed');
    const row = await queue.findByDocument(doc.id);
    expect(row).toMatchObject({ attempts: 1, lastError: 'Pennylane sunucu hatası (502)' });
    expect(Date.parse(row!.nextAttemptAt)).toBeGreaterThan(Date.now());

    expect(await run(doc.id, new Date(Date.now() + 120_000))).toBe('uploaded');
    expect(twin.invoices()).toHaveLength(1);
  });

  it('canlıya geçiş gününden önce girilmiş belge yüklenmez, kuyruk satırı tamamlanır', async () => {
    const doc = await invoice();
    const row = (await queue.findByDocument(doc.id))!;
    expect(await processPennylaneDocumentRow(db, twin.port, row, { liveFrom: '2999-01-01', now: new Date(), files: reader })).toBe(
      'skipped',
    );
    expect(await queue.findByDocument(doc.id)).toBeNull();
    expect(twin.invoices()).toHaveLength(0);
  });
});

describe('ödeme durumu', () => {
  const paidFrom = async (type: 'cash' | 'bank', documentId: string, amountCents: number) => {
    const account = await new AccountService(db).insert({ name: `Pennylane ödeme ${stamp}-${Math.random()}`, type });
    created.accountIds.push(account.id);
    const movements = new MoneyMovementService(db);
    const movement =
      type === 'bank'
        ? (
            await movements.insertImported([
              {
                accountId: account.id,
                direction: 'out',
                amountCents,
                type: 'misc',
                valueDate: '2026-10-03',
                source: 'bank_import',
                reconciled: false,
                importFingerprint: `odeme:${Math.random()}`,
              },
            ])
          )[0]!
        : await movements.insert({ accountId: account.id, direction: 'out', amountCents, type: 'misc' });
    await new MoneyAllocationService(db).insert({ movementId: movement.id, documentId, amountCents });
    return movement;
  };

  it('nakitle tamamen ödenen belge ödendi işaretini alır; bağı çözülünce ödenecek durumuna döner', async () => {
    const doc = await invoice();
    await run(doc.id);
    const movement = await paidFrom('cash', doc.id, 16_550);
    expect(await run(doc.id)).toBe('paid');
    expect(twin.invoices()[0]!.paymentStatus).toBe('paid');
    expect((await mirrors.findByDocument(doc.id))?.paymentStatus).toBe('paid');

    await new MoneyAllocationService(db).remove(movement.id, doc.id);
    expect(await run(doc.id)).toBe('paid');
    expect(twin.invoices()[0]!.paymentStatus).toBe('to_be_paid');
  });

  it('bankadan ödenen ve kısmen ödenen belge işaret almaz', async () => {
    const bankPaid = await invoice();
    await run(bankPaid.id);
    await paidFrom('bank', bankPaid.id, 16_550);
    expect(await run(bankPaid.id)).toBe('unchanged');

    const partly = await invoice();
    await run(partly.id);
    await paidFrom('cash', partly.id, 6_550);
    expect(await run(partly.id)).toBe('unchanged');
    expect(twin.invoices().map((row) => row.paymentStatus)).toEqual([null, null]);
  });
});
