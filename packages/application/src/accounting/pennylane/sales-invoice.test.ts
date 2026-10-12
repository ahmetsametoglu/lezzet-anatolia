import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MoneyDocumentService, OrderService, PennylaneQueueService, SalesInvoiceService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { openSalesInvoices } from '../sales-invoice';
import { salesInvoiceGround } from '../sales-invoice.testkit';
import { PennylaneError } from './errors';
import { memoryPennylane, stuckDocumentAlerts } from './memory-pennylane.testkit';
import { processPennylaneQueueRow } from './queue';

/*
  Satış faturasının Pennylane'de kesilmesi gerçek tablolar ve bellek içi Pennylane ile sınanır. Kuyruk küresel olduğu için testler
  yalnız kendi faturalarının satırını işler.
*/

const db = serviceDb();
const NOW = new Date('2026-10-12T08:00:00Z');
const documents = new MoneyDocumentService(db);
const invoices = new SalesInvoiceService(db);
const queue = new PennylaneQueueService(db);
let ground: Awaited<ReturnType<typeof salesInvoiceGround>>;
let twin: ReturnType<typeof memoryPennylane>;

beforeAll(async () => {
  ground = await salesInvoiceGround(db);
});

beforeEach(() => {
  twin = memoryPennylane();
});

// İkizin kimlikleri her ikizde aynı sayıdan başlar; önceki testin kestiği fatura kalsaydı Pennylane kimliği tekil kısıta takılırdı.
afterEach(async () => {
  await purgeTestData(db, { profileIds: ground.created.profileIds.splice(0) });
});

afterAll(async () => {
  await purgeTestData(db, ground.created);
});

const noFiles = { read: async (key: string) => Promise.reject(new Error(`dosya yok: ${key}`)) };
const run = async (documentId: string) => {
  const row = await queue.findByDocument(documentId);
  return row ? processPennylaneQueueRow(db, twin.port, row, { now: NOW, files: noFiles }) : 'not_queued';
};
const stuckAlerts = (documentId: string) => stuckDocumentAlerts(db, documentId);
/** Müşterinin teslim edilmiş satışı ve kuyruğa girmiş faturası. */
const queuedInvoice = async (customerId: string) => {
  const order = await ground.sale(customerId, { soldOn: '2026-10-05', qty: 2 });
  await openSalesInvoices(db, { now: NOW, customerIds: [customerId] });
  const { data, error } = await db.from('money_document_order').select('document_id').eq('order_id', order.id).single();
  if (error) throw error;
  return { order, documentId: (data as { document_id: string }).document_id };
};

describe('satış faturasının Pennylane kesimi', () => {
  it('fatura müşterisiyle kesilir; numarası belgeye ve siparişe yazılır, müşteriye gönderilir; müşteri ikinci kez açılmaz', async () => {
    const customer = await ground.company();
    const { order, documentId } = await queuedInvoice(customer.id);

    expect(await run(documentId)).toBe('issued');
    expect(twin.customers()).toMatchObject([
      { externalReference: `cus:${customer.id}`, regNo: '732829320', billingAddress: { postalCode: '67000', countryAlpha2: 'FR' } },
    ]);
    expect(twin.customerInvoices()).toMatchObject([
      {
        externalReference: `sinv:${documentId}`,
        date: '2026-10-12',
        deadline: '2026-11-09',
        language: 'fr_FR',
        specialMention: null,
        lines: [{ label: expect.stringContaining('Baklava'), quantity: 2, unitPrice: '10', vatCode: 'FR_55' }],
        invoiceNumber: 'F-2026-0001',
        sentTo: [[customer.email]],
      },
    ]);
    expect(await documents.getById(documentId)).toMatchObject({ number: 'F-2026-0001', issuedOn: '2026-10-12', dueOn: '2026-11-09' });
    expect((await new OrderService(db).getById(order.id))?.invoiceNo).toBe('F-2026-0001');
    expect(await invoices.findByDocument(documentId)).toMatchObject({ status: 'issued' });
    expect(await queue.findByDocument(documentId)).toBeNull();

    // Kesilmiş fatura ikinci kez kesilmez, künyesi değişmez.
    expect(
      await invoices.issue({ documentId, pennylaneInvoiceId: 999_999, number: 'F-2026-9999', issuedOn: '2026-10-13', dueOn: '2026-11-12' }),
    ).toBe(false);
    expect((await documents.getById(documentId))?.number).toBe('F-2026-0001');

    const second = await queuedInvoice(customer.id);
    expect(await run(second.documentId)).toBe('issued');
    expect(twin.customers()).toHaveLength(1);
  });

  // Toplam farkıyla kesinleşseydi Pennylane'deki resmî fatura belgemizden ayrılırdı ve düzeltmesi alacak notu olurdu.
  it("Pennylane'in toplamı bizimkinden farklıysa fatura kesinleşmez, taslak bekler ve muhasebeye bir kez haber gider", async () => {
    const customer = await ground.company();
    const order = await ground.sale(customer.id, { soldOn: '2026-10-05', qty: 2 });
    const documentId = await invoices.open({
      customerId: customer.id,
      business: 'lezzet',
      orderIds: [order.id],
      issuedOn: '2026-10-12',
      dueOn: '2026-11-09',
      amountCents: 2111,
      vatLines: [{ vatRate: 5.5, netCents: 2001, vatCents: 110 }],
      vatRegime: 'standard',
      missing: [],
    });

    expect(await run(documentId)).toBe('blocked');
    expect(twin.customerInvoices()).toMatchObject([{ status: 'draft', invoiceNumber: null }]);
    expect(await invoices.findByDocument(documentId)).toMatchObject({ status: 'queued' });
    expect(await queue.findByDocument(documentId)).toMatchObject({ lastError: 'blocked:total_mismatch' });
    // Haber muhasebe ve yönetimdeki her kişiye ayrı satırdır; aynı sebeple durdukça tekrar etmez.
    const alerts = await stuckAlerts(documentId);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.every((row) => row.payload.reason === 'total_mismatch')).toBe(true);
    expect(await run(documentId)).toBe('blocked');
    expect(await stuckAlerts(documentId)).toHaveLength(alerts.length);
    expect(twin.customerInvoices()).toHaveLength(1);
  });

  // Yarıda kalan deneme yeni fatura açsaydı aynı satış Pennylane'de iki kez faturalanırdı.
  it('yarıda kalan kesme denemesinin taslağı dış referansla bulunur ve kesinleşir; ikinci fatura açılmaz', async () => {
    const customer = await ground.company();
    const { documentId } = await queuedInvoice(customer.id);
    twin.failNext('finalizeCustomerInvoice', new PennylaneError({ code: 'provider', message: 'Pennylane sunucu hatası (502)' }));

    expect(await run(documentId)).toBe('failed');
    expect(twin.customerInvoices()).toMatchObject([{ status: 'draft' }]);
    expect(await run(documentId)).toBe('issued');
    expect(twin.customerInvoices()).toMatchObject([{ status: 'upcoming', invoiceNumber: 'F-2026-0001' }]);
  });
});
