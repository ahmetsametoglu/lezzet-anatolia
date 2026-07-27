import { z } from 'zod';

// Tedarik zinciri şemaları (DOMAIN §16, data-model/stok-tedarik.md): tedarikçi kartı,
// ürün–kod eşlemesi, tedarik siparişi ve mal kabul. Müşteri tarafının simetriği.

const dbNumeric = z.union([z.number(), z.string()]).transform((v) => Number(v));

// ── Supplier ────────────────────────────────────────────────────────────────
// Tedarikçiye borç SAKLANMAZ, türetilir: Σ girişler − Σ ödemeler.

export const SupplierSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  contact: z.record(z.unknown()).nullable(), // telefon/e-posta/adres
  vatNumber: z.string().nullable(),
  /** BİZE tanıdığı vade (gün); null = peşin. */
  paymentTermDays: z.number().int().nullable(),
  note: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type Supplier = z.infer<typeof SupplierSchema>;

export const SupplierInsertSchema = z.object({
  name: z.string().min(1),
  contact: z.record(z.unknown()).nullish(),
  vatNumber: z.string().nullish(),
  paymentTermDays: z.number().int().nullish(),
  note: z.string().nullish(),
  isActive: z.boolean().optional(),
});
export type SupplierInsert = z.infer<typeof SupplierInsertSchema>;

export const SupplierUpdateSchema = SupplierSchema.partial().required({ id: true });
export type SupplierUpdate = z.infer<typeof SupplierUpdateSchema>;

// ── SupplierProduct ─────────────────────────────────────────────────────────
// Tedarik siparişi TEDARİKÇİNİN DİLİYLE yazılsın diye: bizim varyantımız ↔ onların kodu.

export const SupplierProductSchema = z.object({
  id: z.string().uuid(),
  supplierId: z.string().uuid(),
  variantId: z.string().uuid(),
  supplierCode: z.string(),
  nameAtSupplier: z.string().nullable(),
  /** Koli içi adet — sipariş koliyle veriliyorsa çeviri. */
  packQty: z.number().int().nullable(),
  /** Mal kabulde otomatik güncellenir — "geçen sefer kaçtı". */
  lastPurchasePrice: dbNumeric.nullable(),
  isPreferred: z.boolean(),
  createdAt: z.string(),
});
export type SupplierProduct = z.infer<typeof SupplierProductSchema>;

export const SupplierProductInsertSchema = z.object({
  supplierId: z.string().uuid(),
  variantId: z.string().uuid(),
  supplierCode: z.string().min(1),
  nameAtSupplier: z.string().nullish(),
  packQty: z.number().int().nullish(),
  lastPurchasePrice: z.number().nullish(),
  isPreferred: z.boolean().optional(),
});
export type SupplierProductInsert = z.infer<typeof SupplierProductInsertSchema>;

export const SupplierProductUpdateSchema = SupplierProductSchema.partial().required({ id: true });
export type SupplierProductUpdate = z.infer<typeof SupplierProductUpdateSchema>;

// ── PurchaseOrder ───────────────────────────────────────────────────────────
// Taslak → gönderildi → mal kabulde kapanır. Sistem GÖNDERMEZ: temiz liste üretir, gönderim insana ait.

export const PurchaseOrderStatusEnum = z.enum(['draft', 'sent', 'received', 'cancelled']);
export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatusEnum>;

export const PurchaseOrderSchema = z.object({
  id: z.string().uuid(),
  supplierId: z.string().uuid(),
  status: PurchaseOrderStatusEnum,
  sentAt: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type PurchaseOrder = z.infer<typeof PurchaseOrderSchema>;

export const PurchaseOrderInsertSchema = z.object({
  supplierId: z.string().uuid(),
  status: PurchaseOrderStatusEnum.optional(),
  sentAt: z.string().nullish(),
  note: z.string().nullish(),
});
export type PurchaseOrderInsert = z.infer<typeof PurchaseOrderInsertSchema>;

export const PurchaseOrderUpdateSchema = PurchaseOrderSchema.partial().required({ id: true });
export type PurchaseOrderUpdate = z.infer<typeof PurchaseOrderUpdateSchema>;

export const PurchaseOrderItemSchema = z.object({
  id: z.string().uuid(),
  purchaseOrderId: z.string().uuid(),
  variantId: z.string().uuid(),
  supplierProductId: z.string().uuid().nullable(),
  qty: z.number().int(),
  unitPrice: dbNumeric.nullable(),
});
export type PurchaseOrderItem = z.infer<typeof PurchaseOrderItemSchema>;

export const PurchaseOrderItemInsertSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  variantId: z.string().uuid(),
  supplierProductId: z.string().uuid().nullish(),
  qty: z.number().int().positive(),
  unitPrice: z.number().nullish(),
});
export type PurchaseOrderItemInsert = z.infer<typeof PurchaseOrderItemInsertSchema>;

export const PurchaseOrderItemUpdateSchema = PurchaseOrderItemSchema.partial().required({ id: true });
export type PurchaseOrderItemUpdate = z.infer<typeof PurchaseOrderItemUpdateSchema>;

// ── StockIntake ─────────────────────────────────────────────────────────────

export const StockIntakeSchema = z.object({
  id: z.string().uuid(),
  supplierId: z.string().uuid().nullable(),
  purchaseOrderId: z.string().uuid().nullable(),
  date: z.string(),
  totalAmount: dbNumeric,
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type StockIntake = z.infer<typeof StockIntakeSchema>;

export const StockIntakeInsertSchema = z.object({
  supplierId: z.string().uuid().nullish(),
  purchaseOrderId: z.string().uuid().nullish(),
  date: z.string().optional(),
  totalAmount: z.number().optional(),
  note: z.string().nullish(),
});
export type StockIntakeInsert = z.infer<typeof StockIntakeInsertSchema>;

export const StockIntakeUpdateSchema = StockIntakeSchema.partial().required({ id: true });
export type StockIntakeUpdate = z.infer<typeof StockIntakeUpdateSchema>;

/** Mal kabul kalemi — `receive_intake` RPC'sinin girdisi (bir parti = bir kalem). */
export const IntakeLineSchema = z.object({
  variantId: z.string().uuid(),
  qty: z.number().int().positive(),
  expiryDate: z.string(),
  lotNumber: z.string().nullish(),
  /** Birim (paket) başına alış maliyeti — gerçek COGS bundan çıkar. */
  unitCost: z.number().nonnegative().nullish(),
  location: z.string().nullish(),
});
export type IntakeLine = z.infer<typeof IntakeLineSchema>;

/** `receive_intake` dönüşü — giriş + partiler + PO kapanışı tek transaction'da (06.10). */
export const ReceiveIntakeResultSchema = z.object({
  ok: z.boolean(),
  intakeId: z.string().uuid(),
  stockIds: z.array(z.string().uuid()),
  totalAmount: dbNumeric,
});
export type ReceiveIntakeResult = z.infer<typeof ReceiveIntakeResultSchema>;
