import { z } from 'zod';
import { BusinessEnum } from '../primitives/enums.schema';

// Tedarik zinciri şemaları (DOMAIN §16, data-model/stok-tedarik.md): tedarikçi, ürün–kod eşlemesi, tedarik siparişi, mal kabul.
// Para alanları cent'tir (STACK §8); DB kolonları euro `numeric` ve çevrimi servis yapar (`moneyFields`).

// ── Supplier ────────────────────────────────────────────────────────────────
// Tedarikçiye borç SAKLANMAZ, türetilir: Σ girişler − Σ ödemeler.

/** Ülke kodu, ISO 3166-1 alfa-2; tedarikçinin ülkesi faturanın KDV rejimini önerir (`suggestVatRegime`). */
const CountryCodeSchema = z.string().regex(/^[A-Z]{2}$/, 'Ülke iki harfli ISO kodu olmalı (FR, BE, TR…).');

export const SupplierSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  contact: z.record(z.unknown()).nullable(), // telefon/e-posta/adres
  vatNumber: z.string().nullable(),
  /** Bilinmiyorsa `null`; "FR" varsayılmaz, çünkü varsayılan ülke olmayan bilgiyi yazmak olurdu. */
  country: CountryCodeSchema.nullable(),
  /** BİZE tanıdığı vade (gün); null = peşin. */
  paymentTermDays: z.number().int().nullable(),
  /** Belgelerinin varsayılan işi; iki işe birden satan tedarikçide `null` ve belge girişi seçim ister. */
  defaultBusiness: BusinessEnum.nullable(),
  note: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type Supplier = z.infer<typeof SupplierSchema>;

export const SupplierInsertSchema = z.object({
  name: z.string().min(1),
  contact: z.record(z.unknown()).nullish(),
  vatNumber: z.string().nullish(),
  country: CountryCodeSchema.nullish(),
  paymentTermDays: z.number().int().nullish(),
  defaultBusiness: BusinessEnum.nullish(),
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
  /** Mal kabulde otomatik güncellenir — "geçen sefer kaçtı". Kolon `last_purchase_price` (euro). */
  lastPurchasePriceCents: z.number().int().nullable(),
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
  lastPurchasePriceCents: z.number().int().nullish(),
  isPreferred: z.boolean().optional(),
});
export type SupplierProductInsert = z.infer<typeof SupplierProductInsertSchema>;

export const SupplierProductUpdateSchema = SupplierProductSchema.partial().required({ id: true });
export type SupplierProductUpdate = z.infer<typeof SupplierProductUpdateSchema>;

// ── PurchaseOrder ───────────────────────────────────────────────────────────
// Taslak → gönderildi → mal kabulde kapanır. Sistem GÖNDERMEZ: temiz liste üretir, gönderim insana ait.

/**
 * Durum kabullerden türer (`purchase_order_progress`), çünkü tek sipariş birden çok depoda parça parça kabul edilebilir; enum
 * yalnız türetilmiş sonucu taşır.
 */
export const PurchaseOrderStatusEnum = z.enum(['draft', 'sent', 'partially_received', 'received', 'cancelled']);
export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatusEnum>;

export const PurchaseOrderSchema = z.object({
  id: z.string().uuid(),
  supplierId: z.string().uuid(),
  /** Siparişin işi; kalemlerin hedef deposu ve mal kabulün deposu bu işten olmak zorunda, sipariş doğduktan sonra değişmez. */
  business: BusinessEnum,
  status: PurchaseOrderStatusEnum,
  /**
   * Tedarikçinin referans verebileceği numara (`TS-26-4K2M9P`): taslakta null, gönderimde dolu. Rastgeledir, çünkü sıralı numara
   * dışarıya iş hacmimizi söyler.
   */
  referenceNo: z.string().nullable(),
  sentAt: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type PurchaseOrder = z.infer<typeof PurchaseOrderSchema>;

/**
 * Tedarik siparişi liste satırı: bağlar gerçek yabancı anahtar olduğu için tek turda gömülü `select` ile okunur (STACK §13).
 * Ham sayılar taşınır; "tamamlandı mı", "geç kaldı mı" yargısını `domain-core` türetir.
 */
export const PurchaseOrderRowSchema = PurchaseOrderSchema.extend({
  /** Tedarikçi — satırın başlığı; ad olmadan sipariş listesi okunmaz. */
  supplier: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
  items: z.array(
    z.object({
      id: z.string().uuid(),
      qty: z.number().int(),
      /**
       * Beklenen alış (cent); boşsa sipariş tutarı eksiktir ve ekran "≈" der. Gömülü ilişkiye `moneyFields` inmediği için
       * çevrim `PurchaseOrderService.listRows` içinde yapılır.
       */
      unitPriceCents: z.number().int().nullable(),
      /**
       * Bu kaleme fiilen giren partiler; depo kırılımı buradan çıkar, çünkü `target_warehouse_id` yalnız niyettir. Ölçü
       * `initialQty`'dir, çünkü `physicalQty` satışla erir.
       */
      batches: z.array(
        z.object({
          initialQty: z.number().int(),
          warehouse: z.object({ id: z.string().uuid(), code: z.string() }).nullable(),
        }),
      ),
    }),
  ),
});
export type PurchaseOrderRow = z.infer<typeof PurchaseOrderRowSchema>;

export const PurchaseOrderInsertSchema = z.object({
  supplierId: z.string().uuid(),
  business: BusinessEnum,
  status: PurchaseOrderStatusEnum.optional(),
  sentAt: z.string().nullish(),
  note: z.string().nullish(),
});
export type PurchaseOrderInsert = z.infer<typeof PurchaseOrderInsertSchema>;

// İş güncellemede yoktur, veride de değişmez (`purchase_order_business_frozen`).
export const PurchaseOrderUpdateSchema = PurchaseOrderSchema.omit({ business: true }).partial().required({ id: true });
export type PurchaseOrderUpdate = z.infer<typeof PurchaseOrderUpdateSchema>;

export const PurchaseOrderItemSchema = z.object({
  id: z.string().uuid(),
  purchaseOrderId: z.string().uuid(),
  variantId: z.string().uuid(),
  supplierProductId: z.string().uuid().nullable(),
  qty: z.number().int(),
  /** Beklenen alış (**cent**) — kolon `unit_price` (euro numeric). */
  unitPriceCents: z.number().int().nullable(),
  /**
   * İsteğe bağlı hedef depo: tedarikçi listesine yazılır ve depocu kendi payını oradan okur. Niyet beyanıdır, mal fiilen hangi
   * depoya girerse oraya yazılır.
   */
  targetWarehouseId: z.string().uuid().nullable(),
});
export type PurchaseOrderItem = z.infer<typeof PurchaseOrderItemSchema>;

export const PurchaseOrderItemInsertSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  variantId: z.string().uuid(),
  supplierProductId: z.string().uuid().nullish(),
  qty: z.number().int().positive(),
  unitPriceCents: z.number().int().nullish(),
  targetWarehouseId: z.string().uuid().nullish(),
});
export type PurchaseOrderItemInsert = z.infer<typeof PurchaseOrderItemInsertSchema>;

export const PurchaseOrderItemUpdateSchema = PurchaseOrderItemSchema.partial().required({ id: true });
export type PurchaseOrderItemUpdate = z.infer<typeof PurchaseOrderItemUpdateSchema>;

// ── StockIntake ─────────────────────────────────────────────────────────────

export const StockIntakeSchema = z.object({
  id: z.string().uuid(),
  supplierId: z.string().uuid().nullable(),
  purchaseOrderId: z.string().uuid().nullable(),
  /**
   * Mal kabul depoya yapılır, çünkü sipariş depo-üstüdür ama mal bir kapıdan girer; aynı siparişin ikinci kabulü başka depoda
   * olabilir.
   */
  warehouseId: z.string().uuid(),
  date: z.string(),
  /** Kalemlerden hesaplanır (Σ birim maliyet × adet) — **cent**; kolon `total_amount` (euro). */
  totalAmountCents: z.number().int(),
  note: z.string().nullable(),
  /**
   * Kabulü yapan personel; seed ve bakım yolları aktörsüz yazar ve boş değer "bilinmiyor" demektir. Aynı kimlik doğan her
   * harekete de yazılır (`stock_movement.actor_id`).
   */
  receivedBy: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type StockIntake = z.infer<typeof StockIntakeSchema>;

export const StockIntakeInsertSchema = z.object({
  supplierId: z.string().uuid().nullish(),
  purchaseOrderId: z.string().uuid().nullish(),
  warehouseId: z.string().uuid(),
  date: z.string().optional(),
  totalAmountCents: z.number().int().optional(),
  note: z.string().nullish(),
  receivedBy: z.string().uuid().nullish(),
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
  /**
   * Paket başına alış maliyeti (cent). RPC euro bekler ve çevrim servis sınırında yapılır (`StockIntakeService.receive`); ad
   * `…Cents` kalır, çünkü uygulamanın tek birimi cent'tir.
   */
  unitCostCents: z.number().int().nonnegative().nullish(),
  /** Partinin konacağı depo içi alan; serbest metin değil kimlik (`storage_area`). */
  storageAreaId: z.string().uuid().nullish(),
  /**
   * Karşıladığı sipariş kalemi; siparişli kabulde zorunludur ama boş bırakılırsa RPC varyanttan çözer, belirsizse reddeder.
   * Bağsız kabul siparişi hep açık bırakırdı.
   */
  purchaseOrderItemId: z.string().uuid().nullish(),
});
export type IntakeLine = z.infer<typeof IntakeLineSchema>;

/** `receive_intake` dönüşü; giriş, partiler ve sipariş durumu tek işlemde yazılır. */
export const ReceiveIntakeResultSchema = z.object({
  ok: z.boolean(),
  intakeId: z.string().uuid(),
  stockIds: z.array(z.string().uuid()),
  /** Girişin toplamı (**cent**) — RPC jsonb'si euro döner, çevrim servis sınırında (`STACK §8`). */
  totalAmountCents: z.number().int(),
});
export type ReceiveIntakeResult = z.infer<typeof ReceiveIntakeResultSchema>;
