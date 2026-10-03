import { z } from 'zod';
import { MovementDirectionEnum } from './money.schema';
import { QueueRowSchema } from './queue.schema';

/**
 * Pennylane portunun okunuşu (`docs/feature/kasa-muhasebe.md` §8): kimlikler Pennylane'in tamsayılarıdır, tutar cent ve yönü bizim
 * dilimizle. Kip, anahtarın hangi şirkete yazacağını söyler; uyuşmayan şirkete hiçbir istek gitmez.
 */

export const PennylaneModeEnum = z.enum(['sandbox', 'live']);
export type PennylaneMode = z.infer<typeof PennylaneModeEnum>;

export const PennylaneCompanySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  /** Test şirketinde `sandbox-` ile başlar; kipin denetimi buna bakar. */
  regNo: z.string(),
  /** Anahtarın kipi; şirketin türüyle uyuştuğu denetlenmiştir. */
  mode: PennylaneModeEnum,
});
export type PennylaneCompany = z.infer<typeof PennylaneCompanySchema>;

/** Pennylane'deki banka hesabı; bizim banka hesabımız buna eşlenir. */
export const PennylaneBankAccountSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  currency: z.string(),
});
export type PennylaneBankAccount = z.infer<typeof PennylaneBankAccountSchema>;

/** Pennylane'deki tedarikçi; bizim tedarikçimize ya da carimize dış referansla bağlanır (`sup:<kimlik>`, `cp:<kimlik>`). */
export const PennylaneSupplierSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  externalReference: z.string().nullable(),
  vatNumber: z.string().nullable(),
});
export type PennylaneSupplier = z.infer<typeof PennylaneSupplierSchema>;

/** Açılacak tedarikçi; vade gün sayısı Pennylane'in ödeme takvimine geçer. */
export const PennylaneSupplierDraftSchema = z.object({
  name: z.string(),
  externalReference: z.string(),
  vatNumber: z.string().nullable(),
  dueDays: z.number().int().nullable(),
});
export type PennylaneSupplierDraft = z.infer<typeof PennylaneSupplierDraftSchema>;

/** Pennylane'deki alış faturası; bizim yüklediğimizde dış referans belge kimliğimizi taşır. */
export const PennylaneInvoiceSchema = z.object({
  id: z.number().int(),
  externalReference: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  /** Pennylane'deki açık kalan (**cent**, işaretsiz); eşleşmeyle düşer, `paid` işareti düşürmez. Okunamazsa `null`. */
  openCents: z.number().int().nullable(),
});
export type PennylaneInvoice = z.infer<typeof PennylaneInvoiceSchema>;

/** Faturanın satırı: KDV dahil tutar ve KDV (**cent**), Pennylane'in oran kodu (`FR_55`, `intracom_100`, `exempt`). */
export const PennylaneInvoiceLineSchema = z.object({
  grossCents: z.number().int().positive(),
  vatCents: z.number().int().nonnegative(),
  vatCode: z.string(),
});
export type PennylaneInvoiceLine = z.infer<typeof PennylaneInvoiceLineSchema>;

/** Yüklenecek faturanın bizim dilimizdeki hâli; toplamlar satırlardan türer, ayrıca taşınmaz. */
export const PennylaneInvoiceDraftSchema = z.object({
  supplierId: z.number().int(),
  date: z.string(),
  deadline: z.string(),
  invoiceNumber: z.string().nullable(),
  externalReference: z.string(),
  lines: z.array(PennylaneInvoiceLineSchema).min(1),
});
export type PennylaneInvoiceDraft = z.infer<typeof PennylaneInvoiceDraftSchema>;

/** Yüklenmiş faturanın değişen alanları; satırlar verilirse eskileri silinip yenileri yazılır. */
export const PennylaneInvoicePatchSchema = PennylaneInvoiceDraftSchema.omit({ externalReference: true }).partial();
export type PennylaneInvoicePatch = z.infer<typeof PennylaneInvoicePatchSchema>;

/** Hareketin Pennylane'de eşlendiği fatura; müşteri faturası da olabilir, bizim yazdığımız yalnız alış faturasıdır. */
export const PennylaneTransactionMatchSchema = z.object({
  invoiceId: z.number().int(),
  kind: z.enum(['supplier', 'customer']),
});
export type PennylaneTransactionMatch = z.infer<typeof PennylaneTransactionMatchSchema>;

/** Pennylane'deki analitik kategori; grup bir eksendir (ör. "Activité"), Lezzet ile toptan operasyonu o eksende ayrılır. */
export const PennylaneCategorySchema = z.object({
  id: z.number().int(),
  label: z.string(),
  groupId: z.number().int(),
});
export type PennylaneCategory = z.infer<typeof PennylaneCategorySchema>;

export const PennylaneCategoryGroupSchema = z.object({ id: z.number().int(), label: z.string() });
export type PennylaneCategoryGroup = z.infer<typeof PennylaneCategoryGroupSchema>;

/** Faturanın kategorisi ve ağırlığı (0–1); aynı gruptaki ağırlıkların toplamı 1'dir. */
export const PennylaneInvoiceCategorySchema = PennylaneCategorySchema.pick({ id: true, groupId: true }).extend({ weight: z.number() });
export type PennylaneInvoiceCategory = z.infer<typeof PennylaneInvoiceCategorySchema>;

/** Nakitle kapanan faturanın Pennylane'deki işareti; bankadan ödenen fatura eşleşmeyle kapanır, işaret almaz. */
export const PennylanePaymentStatusEnum = z.enum(['paid', 'to_be_paid']);
export type PennylanePaymentStatus = z.infer<typeof PennylanePaymentStatusEnum>;

/** Bankadan Pennylane'e gelen hareket; arşivlenen hareket muhasebede yok sayılır. */
export const PennylaneTransactionSchema = z.object({
  id: z.number().int(),
  bankAccountId: z.number().int(),
  date: z.string(),
  label: z.string().nullable(),
  direction: MovementDirectionEnum,
  /** **Cent**, avro karşılığı, işaretsiz; yön `direction`da. */
  amountCents: z.number().int().nonnegative(),
  currency: z.string(),
  archived: z.boolean(),
  updatedAt: z.string(),
});
export type PennylaneTransaction = z.infer<typeof PennylaneTransactionSchema>;

/** Hareket sayfası; `nextCursor` yoksa liste bitti. */
export const PennylaneTransactionPageSchema = z.object({
  items: z.array(PennylaneTransactionSchema),
  nextCursor: z.string().nullable(),
});
export type PennylaneTransactionPage = z.infer<typeof PennylaneTransactionPageSchema>;

/** Değişiklik akışının satırı: hangi kayıt, ne oldu, akışa ne zaman düştü. */
export const PennylaneChangeSchema = z.object({
  id: z.number().int(),
  operation: z.enum(['insert', 'update', 'delete']),
  processedAt: z.string(),
});
export type PennylaneChange = z.infer<typeof PennylaneChangeSchema>;

export const PennylaneChangePageSchema = z.object({
  items: z.array(PennylaneChangeSchema),
  nextCursor: z.string().nullable(),
});
export type PennylaneChangePage = z.infer<typeof PennylaneChangePageSchema>;

/** Pennylane'deki banka hesabı ve bizdeki eşlemesi (`pennylane_bank_account`); eşlenmemiş hesapta `accountId` boştur. */
export const PennylaneBankAccountMirrorSchema = z.object({
  pennylaneId: z.number().int(),
  name: z.string(),
  /** Son okunan listede görüldüğü an. */
  seenAt: z.string(),
  accountId: z.string().uuid().nullable(),
  mappedAt: z.string().nullable(),
  /** Boşsa sonraki tur canlıya geçiş gününden listeyi okur. */
  listedAt: z.string().nullable(),
});
export type PennylaneBankAccountMirror = z.infer<typeof PennylaneBankAccountMirrorSchema>;

export const PennylaneBankAccountMirrorInsertSchema = PennylaneBankAccountMirrorSchema.partial({
  accountId: true,
  mappedAt: true,
  listedAt: true,
});
export type PennylaneBankAccountMirrorInsert = z.infer<typeof PennylaneBankAccountMirrorInsertSchema>;

/** Banka hesabımıza eşlenmiş satır; eşitleme yalnız bunları okur. */
export const PennylaneMappedAccountSchema = PennylaneBankAccountMirrorSchema.extend({
  accountId: z.string().uuid(),
  mappedAt: z.string(),
});
export type PennylaneMappedAccount = z.infer<typeof PennylaneMappedAccountSchema>;

/** Pennylane hareketinin son okunan hâli ve bizdeki banka satırı (`pennylane_transaction`). */
export const PennylaneTransactionMirrorSchema = z.object({
  pennylaneId: z.number().int(),
  accountId: z.string().uuid(),
  /** Sıfır tutarlı hareket yazılmaz, Pennylane'de silinen izahsız satır silinir; ikisinde de `null`. */
  movementId: z.string().uuid().nullable(),
  valueDate: z.string(),
  direction: MovementDirectionEnum,
  /** **Cent**; kolon `amount` euro. */
  amountCents: z.number().int().nonnegative(),
  label: z.string().nullable(),
  removed: z.boolean(),
  readAt: z.string(),
});
export type PennylaneTransactionMirror = z.infer<typeof PennylaneTransactionMirrorSchema>;

export const PennylaneTransactionMirrorInsertSchema = PennylaneTransactionMirrorSchema.partial({ readAt: true });
export type PennylaneTransactionMirrorInsert = z.infer<typeof PennylaneTransactionMirrorInsertSchema>;

/** Değişiklik akışının kaldığı an, akış başına bir satır. */
export const PennylaneCursorSchema = z.object({
  stream: z.enum(['transactions']),
  processedAt: z.string(),
  updatedAt: z.string(),
});
export type PennylaneCursor = z.infer<typeof PennylaneCursorSchema>;

/** Belgenin karşı tarafının Pennylane'deki tedarikçisi (`pennylane_supplier`); bizde tedarikçi ya da cari, ikisinden biri. */
export const PennylaneSupplierMirrorSchema = z.object({
  pennylaneId: z.number().int(),
  supplierId: z.string().uuid().nullable(),
  counterpartyId: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type PennylaneSupplierMirror = z.infer<typeof PennylaneSupplierMirrorSchema>;

export const PennylaneSupplierMirrorInsertSchema = PennylaneSupplierMirrorSchema.omit({ createdAt: true });
export type PennylaneSupplierMirrorInsert = z.infer<typeof PennylaneSupplierMirrorInsertSchema>;

/** Pennylane yazım kuyruğu (`pennylane_queue`): bir alış belgesi ya da eşleşmesi yazılacak bir banka satırı; satırı tetikleyiciler yazar. */
export const PennylaneQueueSchema = QueueRowSchema.extend({
  documentId: z.string().uuid().nullable(),
  movementId: z.string().uuid().nullable(),
});
export type PennylaneQueue = z.infer<typeof PennylaneQueueSchema>;

export const PennylaneQueueInsertSchema = PennylaneQueueSchema.pick({ documentId: true, movementId: true }).partial();
export type PennylaneQueueInsert = z.infer<typeof PennylaneQueueInsertSchema>;

/** Pennylane'deki fatura ve ona en son yazılan taslak (`pennylane_document`); sonraki yazımın farkı buna göre çıkar. */
export const PennylaneDocumentMirrorSchema = z.object({
  documentId: z.string().uuid(),
  pennylaneInvoiceId: z.number().int(),
  written: PennylaneInvoiceDraftSchema,
  paymentStatus: PennylanePaymentStatusEnum.nullable(),
  /** Pennylane'deki açık kalan (**cent**), son okunduğunda; okunmadıysa `null`. */
  pennylaneOpenCents: z.number().int().nullable(),
  /** Faturaya en son yazılan kategori; ayardaki kategori değişince yeniden yazılır, henüz yazılmadıysa `null`. */
  categoryId: z.number().int().nullable(),
  uploadedAt: z.string(),
  updatedAt: z.string(),
});
export type PennylaneDocumentMirror = z.infer<typeof PennylaneDocumentMirrorSchema>;

export const PennylaneDocumentMirrorInsertSchema = PennylaneDocumentMirrorSchema.partial({
  paymentStatus: true,
  pennylaneOpenCents: true,
  categoryId: true,
  uploadedAt: true,
  updatedAt: true,
});
export type PennylaneDocumentMirrorInsert = z.infer<typeof PennylaneDocumentMirrorInsertSchema>;

/** Pennylane'de çözülen bağ (`pennylane_match_removed`); bizde durur, yeniden yazılmaz. */
export const PennylaneMatchRemovedSchema = z.object({
  allocationId: z.string().uuid(),
  removedAt: z.string(),
});
export type PennylaneMatchRemoved = z.infer<typeof PennylaneMatchRemovedSchema>;

export const PennylaneMatchRemovedInsertSchema = PennylaneMatchRemovedSchema.pick({ allocationId: true });
export type PennylaneMatchRemovedInsert = z.infer<typeof PennylaneMatchRemovedInsertSchema>;
