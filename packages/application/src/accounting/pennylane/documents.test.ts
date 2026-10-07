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
import { mustDelete, purgeTestData, settingsSnapshot } from '@lezzet/database/testing';
import { PENNYLANE_CATEGORY_KEYS } from '@lezzet/domain-core';
import type { MoneyDocumentInsert } from '@lezzet/types';
import { processPennylaneQueueRow } from './queue';
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
const settings = settingsSnapshot(db);

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
  await settings.restore();
  await purgeTestData(db, created);
});

const reader = { read: async (key: string) => files.get(key) ?? Promise.reject(new Error(`dosya yok: ${key}`)) };
const run = async (documentId: string, now = new Date()) => {
  const row = await queue.findByDocument(documentId);
  return row ? processPennylaneQueueRow(db, twin.port, row, { now, files: reader }) : 'not_queued';
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
    business: 'lezzet',
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

  it("aynı dosya Pennylane'de başka bir faturada duruyorsa belge bekler: elle girilmiş faturayı sahiplenmek sonraki yazımla onu ezerdi", async () => {
    const first = await invoice({}, { content: 'ayni-tarama' });
    await run(first.id);
    const twinCopy = await invoice({}, { content: 'ayni-tarama' });
    expect(await run(twinCopy.id)).toBe('blocked');
    expect(await queue.findByDocument(twinCopy.id)).toMatchObject({ lastError: 'blocked:duplicate_file' });

    const foreignFile = await twin.port.uploadFile({
      bytes: new TextEncoder().encode('toptan-taramasi'),
      contentType: 'application/pdf',
      filename: 'x.pdf',
    });
    await twin.port.importInvoice({
      draft: { ...twin.invoices()[0]!, externalReference: '842FHEIKJD', invoiceNumber: 'G-1' },
      fileId: foreignFile,
    });
    const same = await invoice({}, { content: 'toptan-taramasi' });
    expect(await run(same.id)).toBe('blocked');
    expect(await mirrors.findByDocument(same.id)).toBeNull();
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
});

describe('aynı Pennylane şirketindeki öteki operasyon', () => {
  const ourSupplier = async (name: string, vatNumber: string | null) => {
    const id = (await new SupplierService(db).insert({ name: `${name}`, vatNumber, country: 'FR' })).id;
    created.supplierIds.push(id);
    return id;
  };

  it("toptan ekibinin açtığı aynı KDV numaralı tedarikçiye bağlanır, Pennylane'de ikinci kayıt açılmaz", async () => {
    const manual = await twin.port.createSupplier({
      name: 'Grossiste Anatolie',
      externalReference: '01a1019f-1640-7925-9dc3-065e51c9badf',
      vatNumber: 'FR91028564762',
      dueDays: null,
    });
    const doc = await invoice({ supplierId: await ourSupplier(`Anatolie Gros ${stamp}`, 'FR 9102 8564 762') });
    expect(await run(doc.id)).toBe('uploaded');
    expect(twin.suppliers()).toHaveLength(1);
    expect(twin.invoices()[0]!.supplierId).toBe(manual.id);
  });

  it('KDV numarası olmayan karşı taraf aynı adlı tedarikçiye bağlanır; KDV numarası çelişen aynı adlı kayıt başka firmadır', async () => {
    const orange = await twin.port.createSupplier({ name: 'ORANGE TÉLÉCOM', externalReference: 'x-1', vatNumber: null, dueDays: null });
    const counterpartyId = (await new CounterpartyService(db).insert({ name: 'Orange  Telecom' })).id;
    created.counterpartyIds.push(counterpartyId);
    const bill = await invoice({ supplierId: null, counterpartyId });
    expect(await run(bill.id)).toBe('uploaded');
    expect(twin.invoices()[0]!.supplierId).toBe(orange.id);

    await twin.port.createSupplier({ name: `Muller ${stamp}`, externalReference: 'x-2', vatNumber: 'FR11111111111', dueDays: null });
    const other = await invoice({ supplierId: await ourSupplier(`Muller ${stamp}`, 'FR22222222222') });
    expect(await run(other.id)).toBe('uploaded');
    expect(twin.suppliers()).toHaveLength(3);
  });

  it('uyan birden çok tedarikçi ya da bizde başka karşı tarafa bağlı tedarikçi seçilmez, belge bekler', async () => {
    for (const reference of ['x-1', 'x-2']) {
      await twin.port.createSupplier({ name: 'Grossiste', externalReference: reference, vatNumber: 'FR33333333333', dueDays: null });
    }
    const ambiguous = await invoice({ supplierId: await ourSupplier(`Grossiste ${stamp}`, 'FR33333333333') });
    expect(await run(ambiguous.id)).toBe('blocked');
    expect(await queue.findByDocument(ambiguous.id)).toMatchObject({ lastError: 'blocked:supplier_ambiguous' });

    const first = await invoice({ supplierId: await ourSupplier(`Kardeş ${stamp}`, 'FR44444444444') });
    expect(await run(first.id)).toBe('uploaded');
    const duplicate = await invoice({ supplierId: await ourSupplier(`Kardes Gida ${stamp}`, 'FR44444444444') });
    expect(await run(duplicate.id)).toBe('blocked');
    expect(await queue.findByDocument(duplicate.id)).toMatchObject({ lastError: 'blocked:supplier_taken' });
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

describe('işin Pennylane kategorisi', () => {
  const invoiceIdOf = async (documentId: string) => (await mirrors.findByDocument(documentId))!.pennylaneInvoiceId;

  it("yüklenen faturaya Lezzet kategorisi yazılır; Pennylane'de yoksa Activité grubunda açılır, varsa o kullanılır", async () => {
    await settings.override(PENNYLANE_CATEGORY_KEYS.lezzet, 'Lezzet');
    const first = await invoice();
    expect(await run(first.id)).toBe('uploaded');
    const [group] = twin.categoryGroups();
    const [lezzet] = twin.categories();
    expect(group).toMatchObject({ label: 'Activité' });
    expect(lezzet).toMatchObject({ label: 'Lezzet', groupId: group!.id });
    expect(twin.categoriesOf(await invoiceIdOf(first.id))).toEqual([{ id: lezzet!.id, groupId: group!.id, weight: 1 }]);

    const second = await invoice({}, { content: 'ikinci fatura' });
    expect(await run(second.id)).toBe('uploaded');
    expect(twin.categories()).toHaveLength(1);
    expect(twin.categoriesOf(await invoiceIdOf(second.id))).toEqual([{ id: lezzet!.id, groupId: group!.id, weight: 1 }]);
  });

  it('QUALITE belgesi QUALITE kategorisini alır; belgenin işi değişince fatura kuyruğa düşer ve kategorisi yeniden yazılır', async () => {
    await settings.override(PENNYLANE_CATEGORY_KEYS.lezzet, 'Lezzet');
    await settings.override(PENNYLANE_CATEGORY_KEYS.qualite, 'QUALITE');
    const doc = await invoice({ business: 'qualite' });
    expect(await run(doc.id)).toBe('uploaded');
    const invoiceId = await invoiceIdOf(doc.id);
    const qualite = twin.categories().find((row) => row.label === 'QUALITE')!;
    expect(twin.categoriesOf(invoiceId)).toEqual([{ id: qualite.id, groupId: qualite.groupId, weight: 1 }]);

    await documents.update({ id: doc.id, business: 'lezzet' });
    expect(await run(doc.id)).toBe('updated');
    const lezzet = twin.categories().find((row) => row.label === 'Lezzet')!;
    expect(twin.categoriesOf(invoiceId)).toEqual([{ id: lezzet.id, groupId: lezzet.groupId, weight: 1 }]);
  });

  it("Pennylane'de elle değiştirilen kategori sonraki yazımda ezilmez", async () => {
    await settings.override(PENNYLANE_CATEGORY_KEYS.lezzet, 'Lezzet');
    const doc = await invoice();
    await run(doc.id);
    const invoiceId = await invoiceIdOf(doc.id);
    const wholesale = await twin.port.createCategory({ label: 'Grossiste', groupId: twin.categoryGroups()[0]!.id });
    await twin.port.writeCategories({ kind: 'invoice', id: invoiceId }, [{ id: wholesale.id, weight: 1 }]);

    await documents.update({ id: doc.id, dueOn: '2026-11-01' });
    expect(await run(doc.id)).toBe('unchanged');
    expect(twin.categoriesOf(invoiceId)).toEqual([{ id: wholesale.id, groupId: wholesale.groupId, weight: 1 }]);
  });

  it('kategori değişince faturanın başka eksendeki kategorisi korunur; ayar boşsa kategori yazılmaz', async () => {
    await settings.override(PENNYLANE_CATEGORY_KEYS.lezzet, 'Lezzet');
    const doc = await invoice();
    await run(doc.id);
    const invoiceId = await invoiceIdOf(doc.id);
    // Pennylane'de başka bir eksene elle konmuş kategori.
    const project = await twin.port.createCategory({ label: 'Salon', groupId: (await twin.port.createCategoryGroup('Projet')).id });
    await twin.port.writeCategories({ kind: 'invoice', id: invoiceId }, [...twin.categoriesOf(invoiceId), { id: project.id, weight: 1 }]);

    // Ayar belgeyi kuyruğa düşürmez; belge bir sonraki yazımında yeni kategoriyi alır.
    await settings.override(PENNYLANE_CATEGORY_KEYS.lezzet, 'Lezzet Anatolie');
    await documents.update({ id: doc.id, dueOn: '2026-11-01' });
    expect(await run(doc.id)).toBe('updated');
    const anatolie = twin.categories().find((row) => row.label === 'Lezzet Anatolie')!;
    expect(twin.categoriesOf(invoiceId)).toEqual([
      { id: project.id, groupId: project.groupId, weight: 1 },
      { id: anatolie.id, groupId: anatolie.groupId, weight: 1 },
    ]);

    await settings.override(PENNYLANE_CATEGORY_KEYS.lezzet, '');
    const plain = await invoice({}, { content: 'kategorisiz' });
    expect(await run(plain.id)).toBe('uploaded');
    expect(twin.categoriesOf(await invoiceIdOf(plain.id))).toEqual([]);
    expect(await mirrors.findByDocument(plain.id)).toMatchObject({ categoryId: null });
  });
});
