import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AddressService,
  MoneyDocumentService,
  OrderService,
  PennylaneQueueService,
  SalesInvoiceService,
  serviceDb,
} from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import type { SendEmailParams } from '@lezzet/email';
import { openSalesInvoices } from '../sales-invoice';
import { salesInvoiceGround } from '../sales-invoice.testkit';
import { PennylaneError } from './errors';
import { memoryPennylane, stuckDocumentAlerts } from './memory-pennylane.testkit';
import { processPennylaneQueueRow } from './queue';
import { writeSalesInvoice } from './sales-invoice';

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
let mails: SendEmailParams[];

beforeAll(async () => {
  ground = await salesInvoiceGround(db);
});

beforeEach(() => {
  twin = memoryPennylane();
  mails = [];
});

// İkizin kimlikleri her ikizde aynı sayıdan başlar; önceki testin kestiği fatura kalsaydı Pennylane kimliği tekil kısıta takılırdı.
afterEach(async () => {
  await purgeTestData(db, { profileIds: ground.created.profileIds.splice(0) });
});

afterAll(async () => {
  await purgeTestData(db, ground.created);
});

const noFiles = { read: async (key: string) => Promise.reject(new Error(`dosya yok: ${key}`)) };
const mailer = async (params: SendEmailParams) => {
  mails.push(params);
  return { data: { id: `eposta-${mails.length}` }, error: null };
};
const run = async (documentId: string) => {
  const row = await queue.findByDocument(documentId);
  return row ? processPennylaneQueueRow(db, twin.port, row, { now: NOW, files: noFiles, mail: mailer }) : 'not_queued';
};
/** Faturayı keser ve gönderir: ilk tur keser ve PDF'i bekler, Pennylane PDF'i üretince ikinci tur e-postayı yollar. */
const issueAndSend = async (documentId: string) => {
  const first = await run(documentId);
  const pennylaneInvoiceId = (await invoices.findByDocument(documentId))?.pennylaneInvoiceId;
  if (first !== 'blocked' || !pennylaneInvoiceId) return first;
  twin.makePdfReady(pennylaneInvoiceId);
  return run(documentId);
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
  // PDF'siz gönderilseydi müşteri eksiz e-posta alırdı; gönderim anı yazılmasaydı sonraki tur faturayı ikinci kez yollardı.
  it('fatura müşterisiyle kesilir, numarası belgeye ve siparişe yazılır; e-posta PDF hazır olunca ekiyle bir kez gider', async () => {
    const customer = await ground.company();
    const { order, documentId } = await queuedInvoice(customer.id);

    // Pennylane PDF'i kesimden sonra üretir: fatura kesilir, e-posta bekler ve haber düşmez.
    expect(await run(documentId)).toBe('blocked');
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
      },
    ]);
    expect(await documents.getById(documentId)).toMatchObject({ number: 'F-2026-0001', issuedOn: '2026-10-12', dueOn: '2026-11-09' });
    expect((await new OrderService(db).getById(order.id))?.invoiceNo).toBe('F-2026-0001');
    expect(await invoices.findByDocument(documentId)).toMatchObject({ status: 'issued', sentAt: null });
    expect(await queue.findByDocument(documentId)).toMatchObject({ lastError: 'blocked:pdf_pending' });
    expect(await stuckAlerts(documentId)).toEqual([]);
    expect(mails).toEqual([]);

    twin.makePdfReady(twin.customerInvoices()[0]!.id);
    expect(await run(documentId)).toBe('sent');
    expect(mails).toMatchObject([
      {
        to: customer.email,
        subject: 'Votre facture F-2026-0001',
        attachments: [{ filename: 'Facture-F-2026-0001.pdf', contentType: 'application/pdf' }],
      },
    ]);
    const sent = (await invoices.findByDocument(documentId))!;
    expect(Date.parse(sent.sentAt ?? '')).toBe(NOW.getTime());
    expect(await queue.findByDocument(documentId)).toBeNull();
    expect(await writeSalesInvoice(db, twin.port, sent, { now: NOW, mail: mailer })).toEqual({ status: 'skipped' });
    expect(mails).toHaveLength(1);

    // Kesilmiş fatura ikinci kez kesilmez, künyesi değişmez.
    expect(
      await invoices.issue({ documentId, pennylaneInvoiceId: 999_999, number: 'F-2026-9999', issuedOn: '2026-10-13', dueOn: '2026-11-12' }),
    ).toBe(false);
    expect((await documents.getById(documentId))?.number).toBe('F-2026-0001');

    const second = await queuedInvoice(customer.id);
    expect(await issueAndSend(second.documentId)).toBe('sent');
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

  // Elle açılmış kayıt bulunmasaydı aynı firma Pennylane'de ikinci kez açılırdı; güncellenmeseydi fatura eski unvanla kesilirdi.
  it("Pennylane'de elle açılmış aynı firma SIREN'iyle bulunur, kaydı bizden güncellenir ve fatura ona kesilir", async () => {
    const customer = await ground.company();
    const foreignId = twin.addForeignCustomer({ name: 'OBERJAEGERHOF SARL', regNo: '73282932000074' });
    const { documentId } = await queuedInvoice(customer.id);

    expect(await issueAndSend(documentId)).toBe('sent');
    expect(twin.customers()).toHaveLength(1);
    expect(twin.customers()[0]).toMatchObject({
      id: foreignId,
      name: customer.companyInfo!.legalName,
      regNo: '73282932000074',
      billingAddress: { address: '12 rue du Faubourg de Pierre', postalCode: '67000', city: 'Strasbourg', countryAlpha2: 'FR' },
    });
    expect(twin.customerInvoices()).toMatchObject([{ customerId: foreignId, status: 'upcoming' }]);
  });

  // Uyan iki kayıttan biri seçilseydi fatura başka bir firmanın kaydına kesilebilirdi.
  it('aynı firmaya uyan iki kayıt varsa fatura kesilmez ve bekler', async () => {
    const customer = await ground.company();
    twin.addForeignCustomer({ name: 'Oberjaegerhof', regNo: '732829320' });
    twin.addForeignCustomer({ name: 'Oberjaegerhof Strasbourg', vatNumber: 'FR40732829320' });
    const { documentId } = await queuedInvoice(customer.id);

    expect(await run(documentId)).toBe('blocked');
    expect(await queue.findByDocument(documentId)).toMatchObject({ lastError: 'blocked:customer_ambiguous' });
    expect(twin.customers()).toHaveLength(2);
    expect(twin.customerInvoices()).toEqual([]);
  });

  // Adres yazılmasaydı taşınan müşterinin sonraki faturaları eski adrese kesilirdi.
  it('fatura adresi değişince sonraki fatura kesilmeden önce Pennylane kaydı güncellenir', async () => {
    const customer = await ground.company();
    const first = await queuedInvoice(customer.id);
    expect(await issueAndSend(first.documentId)).toBe('sent');

    const addresses = new AddressService(db);
    const billing = (await addresses.listByCustomer(customer.id)).find((address) => address.isBilling)!;
    await addresses.update({ id: billing.id, line1: '3 place Kléber' });
    const second = await queuedInvoice(customer.id);
    expect(await issueAndSend(second.documentId)).toBe('sent');
    expect(twin.customers()).toMatchObject([{ billingAddress: { address: '3 place Kléber' } }]);
  });

  // Yarıda kalan deneme yeni fatura açsaydı aynı satış Pennylane'de iki kez faturalanırdı.
  it('yarıda kalan kesme denemesinin taslağı dış referansla bulunur ve kesinleşir; ikinci fatura açılmaz', async () => {
    const customer = await ground.company();
    const { documentId } = await queuedInvoice(customer.id);
    twin.failNext('finalizeCustomerInvoice', new PennylaneError({ code: 'provider', message: 'Pennylane sunucu hatası (502)' }));

    expect(await run(documentId)).toBe('failed');
    expect(twin.customerInvoices()).toMatchObject([{ status: 'draft' }]);
    expect(await issueAndSend(documentId)).toBe('sent');
    expect(twin.customerInvoices()).toMatchObject([{ status: 'upcoming', invoiceNumber: 'F-2026-0001' }]);
  });

  // Anahtarsız gönderici e-postayı atlar; gönderilmiş sayılsaydı fatura müşteriye hiç gitmeden kapanırdı.
  it('e-posta atlanırsa fatura gönderilmiş sayılmaz, bekler ve muhasebeye haber gider', async () => {
    const customer = await ground.company();
    const { documentId } = await queuedInvoice(customer.id);
    expect(await run(documentId)).toBe('blocked');
    twin.makePdfReady(twin.customerInvoices()[0]!.id);

    const row = (await queue.findByDocument(documentId))!;
    const skipped = async () => ({ data: null, error: null });
    expect(await processPennylaneQueueRow(db, twin.port, row, { now: NOW, files: noFiles, mail: skipped })).toBe('blocked');
    expect(await invoices.findByDocument(documentId)).toMatchObject({ status: 'issued', sentAt: null });
    expect(await queue.findByDocument(documentId)).toMatchObject({ lastError: 'blocked:email_unconfigured' });
    const alerts = await stuckAlerts(documentId);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.every((alert) => alert.payload.reason === 'email_unconfigured')).toBe(true);
  });
});
