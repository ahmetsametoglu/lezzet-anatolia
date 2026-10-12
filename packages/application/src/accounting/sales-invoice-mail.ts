import { brand, companyAddressLine } from '@lezzet/brand';
import { MoneyAllocationService, MoneyDocumentOrderService, OrderItemService, OrderSaleService, type Db } from '@lezzet/database';
import { salesInvoiceLocaleOf, salesInvoiceTotals } from '@lezzet/domain-core';
import { SalesInvoiceEmail, salesInvoiceSubject, sendEmail, type SendEmailParams, type SendEmailResult } from '@lezzet/email';
import { formatInvoiceDate, formatPrice } from '@lezzet/helper';
import {
  BUSINESS_LABELS,
  type Address,
  type Business,
  type MoneyDocument,
  type OrderItem,
  type SalesInvoiceNotification,
  type UserProfile,
} from '@lezzet/types';
import { notificationPreferencesUrl } from '../customer/notification-preferences';

/**
 * Satış faturasının müşteriye giden e-postası (karar 21): Pennylane'in kestiği PDF ekte gider, e-postanın dili fatura adresinin
 * ülkesindendir (karar 22). Banka bilgisi e-postada yazmaz, PDF'tedir.
 */

/** E-postayı gönderen; testler gönderilenleri yakalamak için kendi göndericisini verir. */
export type SalesInvoiceMailer = (params: SendEmailParams) => Promise<SendEmailResult>;

export type SalesInvoiceMailResult = { status: 'sent' } | { status: 'no_email' | 'email_unconfigured' };

/** QUALITE ile Lezzet aynı şirkettir: başlık faturayı kesen işi, alt bilgi tüzel kişiyi söyler. */
const BRAND_OF: Record<Business, string> = { lezzet: brand.name, qualite: BUSINESS_LABELS.qualite };
const POSTAL_ADDRESS = `${brand.company.legalName} · ${companyAddressLine}, France`;
/** Ekin adı kısa ve faturanın dilinde; Pennylane'in dosya adı satıcının ve müşterinin adını uzun uzun taşır. */
const ATTACHMENT_NAME: Record<SalesInvoiceNotification['locale'], string> = { fr: 'Facture', de: 'Rechnung' };

/** Sipariş satırının metni, faturanın dilinde. */
const ORDER_LINE: Record<SalesInvoiceNotification['locale'], { order: (no: string) => string; delivered: (day: string) => string }> = {
  fr: { order: (no) => `Commande ${no}`, delivered: (day) => `Livrée le ${day}` },
  de: { order: (no) => `Bestellung ${no}`, delivered: (day) => `Geliefert am ${day}` },
};

export async function sendSalesInvoiceMail(
  db: Db,
  input: { document: MoneyDocument; customer: UserProfile; billing: Address | null; pdf: Uint8Array; mail?: SalesInvoiceMailer },
): Promise<SalesInvoiceMailResult> {
  if (!input.customer.email) return { status: 'no_email' };
  const locale = salesInvoiceLocaleOf(input.billing?.country ?? input.customer.country);
  const fileName = `${ATTACHMENT_NAME[locale]}-${input.document.number ?? input.document.id}.pdf`;
  const data = await salesInvoiceNotification(db, { document: input.document, customer: input.customer, locale, fileName });
  const result = await (input.mail ?? sendEmail)({
    to: input.customer.email,
    subject: salesInvoiceSubject(data),
    react: SalesInvoiceEmail({ data, brandName: BRAND_OF[input.document.business], postalAddress: POSTAL_ADDRESS }),
    attachments: [{ filename: fileName, content: input.pdf, contentType: 'application/pdf' }],
  });
  if (result.error) throw new Error(`satış faturası e-postası gitmedi: ${result.error}`);
  // Anahtar yokken gönderici e-postayı atlar ve ne kimlik ne hata döner; fatura gönderilmiş sayılmaz.
  return result.data ? { status: 'sent' } : { status: 'email_unconfigured' };
}

/** E-postanın verisi; siparişin tutarı faturanın hesabıyla, sipariş sipariş kurulur ki satırların toplamı faturayı versin. */
async function salesInvoiceNotification(
  db: Db,
  input: { document: MoneyDocument; customer: UserProfile; locale: SalesInvoiceNotification['locale']; fileName: string },
): Promise<SalesInvoiceNotification> {
  const { document, customer, locale } = input;
  const orderIds = (await new MoneyDocumentOrderService(db).ordersOf([document.id])).get(document.id) ?? [];
  const [sales, items, allocations, preferencesUrl] = await Promise.all([
    new OrderSaleService(db).listByIds(orderIds),
    new OrderItemService(db).listByOrders(orderIds),
    new MoneyAllocationService(db).listByDocuments([document.id]),
    notificationPreferencesUrl(db, locale, { customerId: customer.id }),
  ]);
  const itemsOf = (orderId: string): OrderItem[] => items.filter((item) => item.orderId === orderId);
  const allocated = allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0);
  const netCents = document.vatLines.reduce((sum, line) => sum + line.netCents, 0);
  const vatCents = document.vatLines.reduce((sum, line) => sum + line.vatCents, 0);
  const line = ORDER_LINE[locale];
  return {
    locale,
    invoiceNumber: document.number ?? '',
    issuedOn: formatInvoiceDate(document.issuedOn, locale),
    dueOn: formatInvoiceDate(document.dueOn ?? document.issuedOn, locale),
    netTotal: formatPrice(netCents, locale),
    vatTotal: formatPrice(vatCents, locale),
    grandTotal: formatPrice(document.amountCents, locale),
    settled: allocated >= document.amountCents,
    orders: sales
      .sort((a, b) => a.saleDate.localeCompare(b.saleDate))
      .map((sale) => ({
        name: line.order(sale.referenceNo ?? sale.id.slice(0, 8)),
        meta: line.delivered(formatInvoiceDate(sale.saleDate, locale)),
        qty: 1,
        amount: formatPrice(salesInvoiceTotals([{ sale, items: itemsOf(sale.id) }]).amountCents, locale),
        shortfall: null,
      })),
    attachmentName: input.fileName,
    notificationPreferencesUrl: preferencesUrl,
  };
}
