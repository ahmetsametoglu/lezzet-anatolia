import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MoneyAllocationService,
  MoneyDocumentService,
  PennylaneQueueService,
  SalesInvoiceCandidateService,
  SalesInvoiceService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { recordOrderPayment } from '../order/payment';
import { openSalesInvoices } from './sales-invoice';
import { salesInvoiceGround } from './sales-invoice.testkit';

/*
  Satış faturasının açılışı gerçek görünüm, RPC ve tetikleyicilerle sınanır. Aday görünümü bütün satışları taşır; tur testin
  müşterisiyle daraltılır.
*/

const db = serviceDb();
const documents = new MoneyDocumentService(db);
const invoices = new SalesInvoiceService(db);
let ground: Awaited<ReturnType<typeof salesInvoiceGround>>;

beforeAll(async () => {
  ground = await salesInvoiceGround(db);
});

afterAll(async () => {
  await purgeTestData(db, ground.created);
});

const NOW = new Date('2026-10-12T08:00:00Z');
const open = (customerId: string, now = NOW) => openSalesInvoices(db, { now, customerIds: [customerId] });
const documentOf = async (orderId: string) => {
  const { data, error } = await db.from('money_document_order').select('document_id').eq('order_id', orderId).maybeSingle();
  if (error) throw error;
  return data ? (data as { document_id: string }).document_id : null;
};

describe('satış faturasının açılışı', () => {
  // Teslim edilmeyen adet faturaya girseydi müşteri almadığı malı öderdi; tahsilat bağlanmasaydı ödenmiş fatura açık görünürdü.
  it('teslim başına modda fatura teslim edilen adetten açılır, kuyruğa girer ve siparişin tahsilatı faturaya bağlanır', async () => {
    const customer = await ground.company();
    const order = await ground.sale(customer.id, { soldOn: '2026-10-05', qty: 3, fulfilledQty: 2 });
    await recordOrderPayment(db, { orderId: order.id, accountId: ground.accountId, amountCents: 3165, method: 'card', source: 'system' });

    expect(await open(customer.id)).toMatchObject({ queued: 1, awaiting: 0, failed: 0 });
    const documentId = await documentOf(order.id);
    expect(await documents.getById(documentId!)).toMatchObject({
      kind: 'invoice',
      direction: 'in',
      customerId: customer.id,
      amountCents: 2110,
      vatLines: [{ vatRate: 5.5, netCents: 2000, vatCents: 110 }],
      vatRegime: 'standard',
      issuedOn: '2026-10-12',
      // Vade fatura gününden 30 gün değil, teslimin diliminin (1–10 Ekim) bitiminden 30 gün.
      dueOn: '2026-11-09',
    });
    expect(await invoices.findByDocument(documentId!)).toMatchObject({ status: 'queued', missing: [] });
    expect(await new PennylaneQueueService(db).findByDocument(documentId!)).not.toBeNull();
    expect(await new MoneyAllocationService(db).listByDocuments([documentId!])).toMatchObject([{ amountCents: 2110 }]);
    expect(await new SalesInvoiceCandidateService(db).list([customer.id])).toEqual([]);
  });

  // Erken açılsaydı akşam teslimi ikinci faturaya kalırdı; satışlar ayrı açılsaydı ay sonu müşterisi her teslimde fatura alırdı.
  it("ay sonu modunda ayın satışları ayın son günü 20.00'den sonra tek faturada açılır", async () => {
    const customer = await ground.company({ invoiceMode: 'month_end' });
    const first = await ground.sale(customer.id, { soldOn: '2026-09-03' });
    const second = await ground.sale(customer.id, { soldOn: '2026-09-25' });

    expect(await open(customer.id, new Date('2026-09-30T17:00:00Z'))).toMatchObject({ queued: 0 });
    expect(await open(customer.id, new Date('2026-09-30T18:30:00Z'))).toMatchObject({ queued: 1 });
    const documentId = await documentOf(first.id);
    expect(await documentOf(second.id)).toBe(documentId);
    expect(await documents.getById(documentId!)).toMatchObject({ amountCents: 2110, issuedOn: '2026-09-30', dueOn: '2026-10-10' });
  });

  // Eksikle kesilen fatura alıcıya yönlenmez; eksik tamamlanınca güncellenmeseydi fatura hiç onaylanamazdı.
  it('fatura adresi olmayan müşterinin faturası onay bekler; adres eklenince eksik düşer ve onaylanınca kuyruğa girer', async () => {
    const customer = await ground.company({}, { billing: false });
    const actor = await new UserProfileService(db).insert({ name: `Muhasebe ${Date.now()}` });
    ground.created.profileIds.push(actor.id);
    const order = await ground.sale(customer.id, { soldOn: '2026-10-06' });

    expect(await open(customer.id)).toMatchObject({ awaiting: 1 });
    const documentId = (await documentOf(order.id))!;
    expect(await invoices.findByDocument(documentId)).toMatchObject({ status: 'awaiting_approval', missing: ['billing_address'] });
    expect(await invoices.approve(documentId, actor.id)).toBe(false);
    expect(await new PennylaneQueueService(db).findByDocument(documentId)).toBeNull();

    await ground.billingAddress(customer.id);
    expect(await open(customer.id)).toMatchObject({ refreshed: 1 });
    expect(await invoices.findByDocument(documentId)).toMatchObject({ status: 'awaiting_approval', missing: [] });
    expect(await invoices.approve(documentId, actor.id)).toBe(true);
    expect(await invoices.findByDocument(documentId)).toMatchObject({ status: 'queued', approvedBy: actor.id });
    expect(await new PennylaneQueueService(db).findByDocument(documentId)).not.toBeNull();
  });

  // Kasa fişi yazılan satışa fatura da açılsaydı ciro iki kez yazılırdı; sipariş ikinci faturaya girseydi iki kez faturalanırdı.
  it('B2C satışı ve hediye sipariş faturalanmaz; faturası açılmış sipariş ikinci faturaya giremez', async () => {
    const customer = await ground.company();
    const retail = await ground.sale(customer.id, { soldOn: '2026-10-07', channel: 'b2c' });
    const gift = await ground.sale(customer.id, { soldOn: '2026-10-07', isGiftOrder: true });
    const sold = await ground.sale(customer.id, { soldOn: '2026-10-07' });

    expect(await open(customer.id)).toMatchObject({ queued: 1 });
    expect(await documentOf(retail.id)).toBeNull();
    expect(await documentOf(gift.id)).toBeNull();
    const documentId = (await documentOf(sold.id))!;
    const document = (await documents.getById(documentId))!;
    await expect(
      invoices.open({
        customerId: customer.id,
        business: document.business,
        orderIds: [sold.id],
        issuedOn: document.issuedOn,
        dueOn: document.dueOn!,
        amountCents: document.amountCents,
        vatLines: document.vatLines,
        vatRegime: 'standard',
        missing: [],
      }),
    ).rejects.toThrow();
  });
});
