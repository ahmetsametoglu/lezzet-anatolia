import { z } from 'zod';

/**
 * Pennylane Company API v2'nin ölçülen cevap biçimi (docs/feature/kasa-muhasebe.md §6); kimlikler 14 haneli tamsayı, tutarlar
 * işaretli ondalık dize gelir ("-500.0" çıkış), cent'e ve yöne istemci çevirir. Sayfalı listede imleç yalnız konumdur.
 */

export const PennylaneApiMeSchema = z.object({
  company: z.object({ id: z.number().int(), name: z.string(), reg_no: z.string() }),
});

export const PennylaneApiBankAccountPageSchema = z.object({
  items: z.array(z.object({ id: z.number().int(), name: z.string(), currency: z.string() })),
  has_more: z.boolean(),
  next_cursor: z.string().nullable(),
});

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

export const PennylaneApiTransactionPageSchema = z.object({
  items: z.array(PennylaneApiTransactionSchema),
  has_more: z.boolean(),
  next_cursor: z.string().nullable(),
});

/** Değişiklik akışı `processed_at` sırasıyla gelir ve son dört haftayı tutar. */
export const PennylaneApiChangePageSchema = z.object({
  items: z.array(z.object({ id: z.number().int(), operation: z.enum(['insert', 'update', 'delete']), processed_at: z.string() })),
  has_more: z.boolean(),
  next_cursor: z.string().nullable(),
});

/** Elle açılan tedarikçinin dış referansını Pennylane üretir; KDV numarası yoksa boş dize gelir. */
export const PennylaneApiSupplierSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  external_reference: z.string().nullable(),
  vat_number: z.string().nullable(),
});

export const PennylaneApiSupplierPageSchema = z.object({
  items: z.array(PennylaneApiSupplierSchema),
  has_more: z.boolean(),
  next_cursor: z.string().nullable(),
});

export const PennylaneApiFileAttachmentSchema = z.object({ id: z.number().int() });

export const PennylaneApiInvoiceSchema = z.object({
  id: z.number().int(),
  external_reference: z.string().nullable(),
  invoice_number: z.string().nullable(),
  /** Alış faturasında ödenmemiş tutar eksi işaretle gelir, kapanınca sıfırdır. */
  remaining_amount_with_tax: z.string().nullish(),
});

export const PennylaneApiInvoicePageSchema = z.object({
  items: z.array(PennylaneApiInvoiceSchema),
  has_more: z.boolean(),
  next_cursor: z.string().nullable(),
});

/** Satırların yalnız kimliği okunur: güncellemede eski satırlar kimlikle silinir. */
export const PennylaneApiInvoiceLinePageSchema = z.object({
  items: z.array(z.object({ id: z.number().int() })),
  has_more: z.boolean(),
  next_cursor: z.string().nullable(),
});

/** Liste eşleme sırasını vermiyor: faturalar kimliğe göre azalan sırayla gelir. */
export const PennylaneApiTransactionMatchPageSchema = z.object({
  items: z.array(z.object({ id: z.number().int(), type: z.enum(['supplier', 'customer']) })),
  has_more: z.boolean(),
  next_cursor: z.string().nullable(),
});
