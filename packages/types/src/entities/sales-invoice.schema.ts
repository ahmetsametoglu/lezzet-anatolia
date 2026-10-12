import { z } from 'zod';
import { BusinessEnum, InvoiceModeEnum, VatTreatmentEnum } from '../primitives/enums.schema';
import { MoneyDocumentInsertSchema } from './money.schema';

/**
 * Satış faturasının akışı (profesyonel satış, karar 17): teslimde taslak doğar, bilgisi tam olan kuyruğa girer ve Pennylane'de
 * kesilir, eksik olan onay bekler. Belgenin kendisi `money_document`ta durur; bu kayıt yalnız akışını taşır.
 */
export const SalesInvoiceStatusEnum = z.enum(['awaiting_approval', 'queued', 'issued']);
export type SalesInvoiceStatus = z.infer<typeof SalesInvoiceStatusEnum>;

/** Kesmeyi bekleten eksik: fatura alıcıya SIREN'iyle yönlenir, fatura adresi ve B2B onayı faturanın şartıdır. */
export const SalesInvoiceGapEnum = z.enum(['siren', 'billing_address', 'b2b_approval']);
export type SalesInvoiceGap = z.infer<typeof SalesInvoiceGapEnum>;

export const SalesInvoiceSchema = z.object({
  documentId: z.string().uuid(),
  status: SalesInvoiceStatusEnum,
  missing: z.array(SalesInvoiceGapEnum),
  approvedBy: z.string().uuid().nullable(),
  approvedAt: z.string().nullable(),
  /** Pennylane'deki müşteri faturası; kesilince dolar. */
  pennylaneInvoiceId: z.number().int().nullable(),
  issuedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SalesInvoice = z.infer<typeof SalesInvoiceSchema>;

/** Faturası açılmamış B2B satış (`sales_invoice_candidate` görünümü); faturanın ne zaman ve hangi satışlarla açılacağı uygulamanın kararıdır. */
export const SalesInvoiceCandidateSchema = z.object({
  orderId: z.string().uuid(),
  customerId: z.string().uuid(),
  business: BusinessEnum,
  saleDate: z.string(),
  vatTreatment: VatTreatmentEnum,
  invoiceMode: InvoiceModeEnum,
});
export type SalesInvoiceCandidate = z.infer<typeof SalesInvoiceCandidateSchema>;

/** Satış faturasının siparişi (`money_document_order`); bir sipariş tek faturaya girer. */
export const MoneyDocumentOrderSchema = z.object({
  documentId: z.string().uuid(),
  orderId: z.string().uuid(),
});
export type MoneyDocumentOrder = z.infer<typeof MoneyDocumentOrderSchema>;

/** Faturanın açılışı: hesaplanmış künye (**cent**) ve siparişleri; eksiği olmayan fatura kuyruğa, olan onaya girer. */
export const SalesInvoiceOpenInputSchema = MoneyDocumentInsertSchema.pick({
  business: true,
  issuedOn: true,
  amountCents: true,
  vatLines: true,
  vatRegime: true,
})
  .required()
  .extend({
    customerId: z.string().uuid(),
    orderIds: z.array(z.string().uuid()).min(1),
    dueOn: z.string(),
    missing: z.array(SalesInvoiceGapEnum),
  });
export type SalesInvoiceOpenInput = z.infer<typeof SalesInvoiceOpenInputSchema>;

/** Onay bekleyen faturanın müşteri kaydı tamamlandıktan sonraki künyesi. */
export const SalesInvoiceRefreshInputSchema = SalesInvoiceOpenInputSchema.pick({
  dueOn: true,
  amountCents: true,
  vatLines: true,
  vatRegime: true,
  missing: true,
}).extend({ documentId: z.string().uuid() });
export type SalesInvoiceRefreshInput = z.infer<typeof SalesInvoiceRefreshInputSchema>;

/** Pennylane'de kesilen faturanın resmî künyesi: numara, gün ve vade; tutar bizimkidir, çünkü fatura toplam eşitse kesinleşir. */
export const SalesInvoiceIssueInputSchema = SalesInvoiceOpenInputSchema.pick({
  issuedOn: true,
  dueOn: true,
}).extend({
  documentId: z.string().uuid(),
  pennylaneInvoiceId: z.number().int(),
  number: z.string().min(1),
});
export type SalesInvoiceIssueInput = z.infer<typeof SalesInvoiceIssueInputSchema>;
