import { z } from 'zod';

/**
 * Pennylane Company API v2'nin ölçülen cevap biçimi (docs/feature/kasa-muhasebe.md §6); kimlikler 14 haneli tamsayı, tutarlar
 * işaretli ondalık dize gelir ("-500.0" çıkış), cent'e ve yöne istemci çevirir. Sayfalı listede imleç yalnız konumdur.
 */

/** Sayfalı listenin zarfı. */
const pageOf = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), has_more: z.boolean(), next_cursor: z.string().nullable() });

export const PennylaneApiMeSchema = z.object({
  company: z.object({ id: z.number().int(), name: z.string(), reg_no: z.string() }),
});

export const PennylaneApiBankAccountPageSchema = pageOf(z.object({ id: z.number().int(), name: z.string(), currency: z.string() }));

export const PennylaneApiTransactionSchema = z.object({
  id: z.number().int(),
  label: z.string().nullable(),
  date: z.string(),
  /** Avro karşılığı, işaretli: çıkış eksi. Para birimi avro değilse `currency_amount` hareketin kendi birimindedir. */
  amount: z.string(),
  currency: z.string(),
  archived_at: z.string().nullable(),
  updated_at: z.string(),
  bank_account: z.object({ id: z.number().int() }),
});
export type PennylaneApiTransaction = z.infer<typeof PennylaneApiTransactionSchema>;

export const PennylaneApiTransactionPageSchema = pageOf(PennylaneApiTransactionSchema);

/** Değişiklik akışı `processed_at` sırasıyla gelir ve son dört haftayı tutar. */
export const PennylaneApiChangePageSchema = pageOf(
  z.object({ id: z.number().int(), operation: z.enum(['insert', 'update', 'delete']), processed_at: z.string() }),
);

/** Elle açılan tedarikçinin dış referansını Pennylane üretir; KDV numarası yoksa boş dize gelir. */
export const PennylaneApiSupplierSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  external_reference: z.string().nullable(),
  vat_number: z.string().nullable(),
});

export const PennylaneApiSupplierPageSchema = pageOf(PennylaneApiSupplierSchema);

export const PennylaneApiFileAttachmentSchema = z.object({ id: z.number().int() });

export const PennylaneApiInvoiceSchema = z.object({
  id: z.number().int(),
  external_reference: z.string().nullable(),
  invoice_number: z.string().nullable(),
  /** Alış faturasında ödenmemiş tutar eksi işaretle gelir, kapanınca sıfırdır. */
  remaining_amount_with_tax: z.string().nullish(),
});

export const PennylaneApiInvoicePageSchema = pageOf(PennylaneApiInvoiceSchema);

/** Satırların yalnız kimliği okunur: güncellemede eski satırlar kimlikle silinir. */
export const PennylaneApiInvoiceLinePageSchema = pageOf(z.object({ id: z.number().int() }));

/** Müşteri kaydı; alanlar Pennylane başvuru belgesinden, cevap biçimi ölçülmedi. Elle açılmış kayıtta kimlik ve adres boş olabilir. */
export const PennylaneApiCustomerSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  external_reference: z.string().nullable(),
  reg_no: z.string().nullish(),
  vat_number: z.string().nullish(),
  billing_address: z.object({ address: z.string(), postal_code: z.string(), city: z.string(), country_alpha2: z.string() }).nullish(),
});
export type PennylaneApiCustomer = z.infer<typeof PennylaneApiCustomerSchema>;
export const PennylaneApiCustomerPageSchema = pageOf(PennylaneApiCustomerSchema);

/** Müşteri faturası (başvuru belgesinden, cevap biçimi ölçülmedi); tutarlar ondalık dize, numara fatura kesinleşince dolar. */
export const PennylaneApiCustomerInvoiceSchema = z.object({
  id: z.number().int(),
  invoice_number: z.string().nullable(),
  external_reference: z.string().nullable(),
  amount: z.string(),
  currency_amount_before_tax: z.string(),
  tax: z.string(),
  date: z.string().nullable(),
  deadline: z.string().nullable(),
  status: z.string(),
});
export type PennylaneApiCustomerInvoice = z.infer<typeof PennylaneApiCustomerInvoiceSchema>;
export const PennylaneApiCustomerInvoicePageSchema = pageOf(PennylaneApiCustomerInvoiceSchema);

/** Kesilmiş faturanın PDF'i: dosya adı Pennylane PDF'i ürettiğinde dolar, bağlantı herkese açıktır. */
export const PennylaneApiCustomerInvoiceFileSchema = z.object({ filename: z.string().nullable(), public_file_url: z.string().nullable() });

/** Liste eşleme sırasını vermiyor: faturalar kimliğe göre azalan sırayla gelir. */
export const PennylaneApiTransactionMatchPageSchema = pageOf(z.object({ id: z.number().int(), type: z.enum(['supplier', 'customer']) }));

export const PennylaneApiCategoryGroupSchema = z.object({ id: z.number().int(), label: z.string() });
export const PennylaneApiCategoryGroupPageSchema = pageOf(PennylaneApiCategoryGroupSchema);

export const PennylaneApiInvoiceTemplatePageSchema = pageOf(z.object({ id: z.number().int(), name: z.string() }));

export const PennylaneApiCategorySchema = z.object({
  id: z.number().int(),
  label: z.string(),
  category_group: z.object({ id: z.number().int() }),
});
export const PennylaneApiCategoryPageSchema = pageOf(PennylaneApiCategorySchema);

/** Kayda (fatura ya da banka işlemi) konmuş kategori; ağırlık ondalık dize gelir ("1.0") ve aynı gruptaki ağırlıkların toplamı 1'dir. */
export const PennylaneApiAssignedCategoryPageSchema = pageOf(PennylaneApiCategorySchema.extend({ weight: z.string() }));
