import {
  AddressService,
  MoneyDocumentOrderService,
  MoneyDocumentService,
  OrderItemService,
  OrderSaleService,
  PennylaneCustomerService,
  SalesInvoiceService,
  SettingsService,
  UserProfileService,
  type Db,
} from '@lezzet/database';
import {
  PAYMENT_TERM_DAYS_DEFAULT,
  PAYMENT_TERM_DAYS_KEY,
  PENNYLANE_INVOICE_TEMPLATE_KEYS,
  SALES_INVOICE_SHIPPING_LABEL,
  pennylaneCustomerCandidates,
  pennylaneCustomerDraft,
  pennylaneCustomerIdentity,
  pennylaneCustomerPatch,
  pennylaneCustomerReference,
  pennylaneSalesInvoiceDraft,
  pennylaneSalesInvoiceLines,
  pennylaneSalesInvoiceReference,
  pennylaneTotalsMatch,
  salesInvoiceDueOn,
  salesInvoiceLocaleOf,
  type PennylaneSalesInvoiceBlock,
} from '@lezzet/domain-core';
import { parisDateOf } from '@lezzet/helper';
import type { Address, Business, MoneyDocument, PennylaneCustomerInvoice, SalesInvoice, UserProfile } from '@lezzet/types';
import { resolveOrderLines } from '../../order/customer-orders';
import { sendSalesInvoiceMail, type SalesInvoiceMailer } from '../sales-invoice-mail';
import type { PennylanePort } from './port';

/**
 * Satış faturasının Pennylane'de kesilmesi (docs/feature/profesyonel-satis.md, Faz 4): müşteri kaydı bulunur ya da açılır, fatura
 * taslak açılır ve Pennylane'in hesapladığı toplam bizimkiyle aynıysa kesinleşir. Numarası belgeye ve siparişlere yazılır, PDF'i
 * bizim e-postamızla müşteriye gider (`sales-invoice-mail.ts`).
 */

export type SalesInvoiceWriteResult = { status: 'sent' | 'skipped' } | { status: 'blocked'; reason: PennylaneSalesInvoiceBlock };

export async function writeSalesInvoice(
  db: Db,
  pennylane: PennylanePort,
  invoice: SalesInvoice,
  ctx: { now: Date; mail?: SalesInvoiceMailer },
): Promise<SalesInvoiceWriteResult> {
  if (invoice.status === 'issued') return invoice.sentAt ? { status: 'skipped' } : sendIssued(db, pennylane, invoice.documentId, ctx);
  if (invoice.status !== 'queued') return { status: 'skipped' };
  const document = await new MoneyDocumentService(db).getById(invoice.documentId);
  if (!document?.customerId) return { status: 'skipped' };
  const [customer, addresses, ordersOf] = await Promise.all([
    new UserProfileService(db).getById(document.customerId),
    new AddressService(db).listByCustomer(document.customerId),
    new MoneyDocumentOrderService(db).ordersOf([document.id]),
  ]);
  if (!customer) return { status: 'skipped' };
  const billing = addresses.find((address) => address.isBilling) ?? null;
  const ensured = await ensureCustomer(db, pennylane, customer, billing);
  if (ensured.status === 'blocked') return ensured;
  const customerId = ensured.id;

  let draft = await pennylane.findCustomerInvoice(pennylaneSalesInvoiceReference(document.id));
  if (!draft) {
    const created = await createDraft(db, pennylane, {
      document,
      customer,
      billing,
      customerId,
      orderIds: ordersOf.get(document.id) ?? [],
      now: ctx.now,
    });
    if (created.status === 'blocked') return created;
    draft = created.invoice;
  }
  // Yarıda kalmış denemenin kesinleşmiş faturası da karşılaştırılır; toplamı ayrıysa numarası bize yazılmaz.
  if (!pennylaneTotalsMatch(document, draft)) return { status: 'blocked', reason: 'total_mismatch' };
  const issued = draft.status === 'draft' ? await pennylane.finalizeCustomerInvoice(draft.id) : draft;
  if (!issued.invoiceNumber || !issued.date || !issued.deadline) {
    throw new Error('Pennylane kesinleşen faturanın numarasını ya da günlerini vermedi');
  }
  await new SalesInvoiceService(db).issue({
    documentId: document.id,
    pennylaneInvoiceId: issued.id,
    number: issued.invoiceNumber,
    issuedOn: issued.date,
    dueOn: issued.deadline,
  });
  return sendIssued(db, pennylane, document.id, ctx);
}

/**
 * Kesilmiş faturanın PDF'i bizim e-postamızla gider; Pennylane PDF'i kesimden sonra ürettiği için hazır değilse fatura sonraki turu
 * bekler. Gönderim anı bir kez yazılır, böylece sonraki tur aynı faturayı yeniden göndermez.
 */
async function sendIssued(
  db: Db,
  pennylane: PennylanePort,
  documentId: string,
  ctx: { now: Date; mail?: SalesInvoiceMailer },
): Promise<SalesInvoiceWriteResult> {
  const invoices = new SalesInvoiceService(db);
  const [invoice, document] = await Promise.all([invoices.findByDocument(documentId), new MoneyDocumentService(db).getById(documentId)]);
  if (!invoice?.pennylaneInvoiceId || invoice.sentAt || !document?.customerId) return { status: 'skipped' };
  const [customer, addresses] = await Promise.all([
    new UserProfileService(db).getById(document.customerId),
    new AddressService(db).listByCustomer(document.customerId),
  ]);
  if (!customer) return { status: 'skipped' };
  if (!customer.email) return { status: 'blocked', reason: 'no_email' };
  const pdf = await pennylane.customerInvoicePdf(invoice.pennylaneInvoiceId);
  if (!pdf) return { status: 'blocked', reason: 'pdf_pending' };
  const billing = addresses.find((address) => address.isBilling) ?? null;
  const mailed = await sendSalesInvoiceMail(db, { document, customer, billing, pdf, mail: ctx.mail });
  if (mailed.status !== 'sent') return { status: 'blocked', reason: mailed.status };
  await invoices.markSent(documentId, ctx.now.toISOString());
  return { status: 'sent' };
}

/**
 * Faturanın taslağı: satırlar teslim edilen kalemlerden ve kargodan, fatura günü bugündür, vade bugünden hesaplanır. Çok siparişli
 * faturada satır siparişin numarasını taşır ki müşteri satırı teslimatına bağlayabilsin.
 */
async function createDraft(
  db: Db,
  pennylane: PennylanePort,
  input: {
    document: MoneyDocument;
    customer: UserProfile;
    billing: Address | null;
    customerId: number;
    orderIds: readonly string[];
    now: Date;
  },
): Promise<{ status: 'created'; invoice: PennylaneCustomerInvoice } | { status: 'blocked'; reason: PennylaneSalesInvoiceBlock }> {
  const { document, customer } = input;
  const [sales, items] = await Promise.all([
    new OrderSaleService(db).listByIds(input.orderIds),
    new OrderItemService(db).listByOrders(input.orderIds),
  ]);
  if (sales.length === 0) throw new Error('Satış faturasının satışları okunamadı');
  sales.sort((a, b) => a.saleDate.localeCompare(b.saleDate) || (a.referenceNo ?? '').localeCompare(b.referenceNo ?? ''));
  const locale = salesInvoiceLocaleOf(input.billing?.country ?? customer.country);
  const names = await resolveOrderLines(db, items, locale);
  const prefix = (referenceNo: string | null, label: string) => (sales.length > 1 && referenceNo ? `${referenceNo} · ${label}` : label);
  const lines = pennylaneSalesInvoiceLines(
    sales.map((sale) => ({
      sale,
      items: items
        .filter((item) => item.orderId === sale.id)
        .map((item) => {
          const name = names.get(item.variantId);
          const label = [name?.name, name?.unit].filter(Boolean).join(' · ');
          if (!label) throw new Error(`Satış faturası kaleminin ürün adı okunamadı: ${item.variantId}`);
          return { ...item, label: prefix(sale.referenceNo, label) };
        }),
      shippingLabel: prefix(sale.referenceNo, SALES_INVOICE_SHIPPING_LABEL[locale]),
    })),
    document.vatRegime,
    customer.country,
  );
  if (!lines) return { status: 'blocked', reason: 'vat_code' };

  const today = parisDateOf(input.now);
  const termDays = customer.paymentTermDays ?? (await new SettingsService(db).getNumber(PAYMENT_TERM_DAYS_KEY, PAYMENT_TERM_DAYS_DEFAULT));
  const invoice = await pennylane.createCustomerInvoice(
    pennylaneSalesInvoiceDraft({
      documentId: document.id,
      customerId: input.customerId,
      date: today,
      deadline: salesInvoiceDueOn({ issuedOn: today, termDays, firstDeliveryOn: sales[0]!.saleDate }),
      templateId: await templateOf(db, document.business),
      language: locale,
      vatTreatment: sales[0]!.vatTreatment,
      lines,
    }),
  );
  return { status: 'created', invoice };
}

/**
 * Müşterinin Pennylane kaydı: aynada yoksa dış referansla, o da yoksa aynı firmanın SIREN ya da KDV numaralı elle açılmış kaydı
 * aranır, hiçbiri yoksa fatura adresiyle açılır; uyan birden çok kayıt ya da bizde başka müşteriye bağlı kayıt seçilemez. Bağlı
 * kaydın unvanı, kimliği ya da adresi bizden ayrıysa fatura kesilmeden önce güncellenir.
 */
async function ensureCustomer(
  db: Db,
  pennylane: PennylanePort,
  customer: UserProfile,
  billing: Address | null,
): Promise<{ status: 'ok'; id: number } | { status: 'blocked'; reason: PennylaneSalesInvoiceBlock }> {
  const mirrors = new PennylaneCustomerService(db);
  const draft = billing ? pennylaneCustomerDraft(customer, billing) : null;
  const mirror = await mirrors.findByCustomer(customer.id);
  let current = mirror ? await pennylane.getCustomer(mirror.pennylaneId) : null;
  if (mirror && !current) throw new Error(`Pennylane müşteri kaydı bulunamadı: ${mirror.pennylaneId}`);
  if (!current) {
    current = await pennylane.findCustomer(pennylaneCustomerReference(customer.id));
    if (!current) {
      const candidates = pennylaneCustomerCandidates(await pennylane.listCustomers(), pennylaneCustomerIdentity(customer));
      if (candidates.length > 1) return { status: 'blocked', reason: 'customer_ambiguous' };
      current = candidates[0] ?? null;
    }
    if (current && (await mirrors.findByPennylaneId(current.id))) return { status: 'blocked', reason: 'customer_taken' };
    if (!current) {
      if (!draft) return { status: 'blocked', reason: 'billing_address' };
      const created = await pennylane.createCustomer(draft);
      await mirrors.save({ pennylaneId: created.id, customerId: customer.id });
      return { status: 'ok', id: created.id };
    }
    await mirrors.save({ pennylaneId: current.id, customerId: customer.id });
  }
  const patch = draft ? pennylaneCustomerPatch(current, draft) : null;
  if (patch) await pennylane.updateCustomer(current.id, patch);
  return { status: 'ok', id: current.id };
}

/** İşin şablon ayarı; boş ya da sayı olmayan değer Pennylane'in varsayılan şablonudur. */
async function templateOf(db: Db, business: Business): Promise<number | null> {
  const value = await new SettingsService(db).get<unknown>(PENNYLANE_INVOICE_TEMPLATE_KEYS[business], null);
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}
