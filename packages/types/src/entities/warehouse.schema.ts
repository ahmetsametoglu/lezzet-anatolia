import { z } from 'zod';
import { dbNumeric, dbNumericNullable } from '../primitives/db-numeric';
import { BusinessEnum, CountryEnum, TransferStatusEnum, WarehouseKindEnum } from '../primitives/enums.schema';

// Depo ağı şemaları (DOMAIN §17, data-model/depo.md). Depo müşteriye gösterilmez: müşteri posta kodunu girer, depo içeride çözülür.

// ── Warehouse ───────────────────────────────────────────────────────────────

export const WarehouseSchema = z.object({
  id: z.string().uuid(),
  /** Belge numarasına ve ekrana giren kısa kod ('STR'). `IMH-STR-26-0012` elle yazılacak kadar kısa. */
  code: z.string(),
  name: z.string(),
  /**
   * Tesis mi, kurye aracı mı; araç da bir yerdir: yüklenir, sayılır, transfer alır ve içinden satış yapılır. Araç bölgeye
   * bağlanamaz, kargo deposu olamaz, depo-üstü toplama girmez ve seçicilerde seçenek olmaz (`data-model/depo.md`).
   */
  kind: WarehouseKindEnum,
  /**
   * Aracın evi olan tesis; yalnız araçta dolu, tesiste daima `null`. Bağ veride durur, çünkü transferden ya da kapsamdan türetmek
   * yalnız genelde doğrudur ve depo işlerinde yetmez.
   */
  homeWarehouseId: z.string().uuid().nullable(),
  /**
   * Bu deponun aracı (ruhsat ve soğuk zincir tarafı); yalnız araçta dolu ve orada zorunlu, iki depo aynı aracı gösteremez. Malın
   * hangi araçtan çıkacağı bu bağdan okunur (`warehouse_vehicle_identity`, `warehouse_vehicle_unique`).
   */
  vehicleId: z.string().uuid().nullable(),
  /** Fiziksel tesisin ülkesi; KDV buna bağlıdır (DOMAIN §5/§17). Bölge sınır ötesi olabilir (ADR-002), depo olamaz. */
  countryCode: CountryEnum,
  /** Deponun işi; stok, mal kabul ve sipariş işini buradan alır. */
  business: BusinessEnum,
  address: z.record(z.unknown()).nullable(),
  /**
   * Deponun coğrafi noktası, kapalı turun başlangıcı ve bitişi; `address` içine gömülmedi, çünkü gömülü sayı kısıt taşıyamaz.
   * `null` noktada sıralama motoru varsayılan merkez uydurmaz, `no_start` ile reddeder.
   */
  lat: dbNumericNullable,
  lng: dbNumericNullable,
  /** Kargo çıkış deposu. Ülke başına en fazla bir aktif tane — kural veritabanında (0042). */
  shipsOnline: z.boolean(),
  /** Gel-al noktası: izinli müşteri hazır siparişini buradan alır; yalnız tesiste açılabilir (kısıt veride). */
  pickupEnabled: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
});
export type Warehouse = z.infer<typeof WarehouseSchema>;

export const WarehouseInsertSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  /** Verilmezse `facility` — bugüne kadarki her satır bir tesistir, araç İSTİSNADIR. */
  kind: WarehouseKindEnum.optional(),
  /** Aracın evi; tesiste verilmez (veride de kısıt var — `warehouse_home_only_vehicle`). */
  homeWarehouseId: z.string().uuid().nullish(),
  /** Araç deposunda ZORUNLU, tesiste yasak (`warehouse_vehicle_identity`) — künyesi varlık şemasında. */
  vehicleId: z.string().uuid().nullish(),
  countryCode: CountryEnum.optional(),
  /** Verilmezse Lezzet (veri varsayılanı). */
  business: BusinessEnum.optional(),
  address: z.record(z.unknown()).nullish(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  shipsOnline: z.boolean().optional(),
  pickupEnabled: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
export type WarehouseInsert = z.infer<typeof WarehouseInsertSchema>;

export const WarehouseUpdateSchema = WarehouseSchema.partial().required({ id: true });
export type WarehouseUpdate = z.infer<typeof WarehouseUpdateSchema>;


// ── Depo bazlı asgari stok eşiği ────────────────────────────────────────────
// Varyanttaki `minStockQty` varsayılandır; bu satır yalnız istisnayı yazar, satır yoksa genel eşik işler.

export const WarehouseVariantThresholdSchema = z.object({
  warehouseId: z.string().uuid(),
  variantId: z.string().uuid(),
  minStockQty: z.number().int().nonnegative(),
});
export type WarehouseVariantThreshold = z.infer<typeof WarehouseVariantThresholdSchema>;

// Ayrı bir `Insert` şeması YOK: üç alanın üçü de zorunlu — yazım ile okuma aynı şekil.

/** Bir boyun bir depodaki eşiği: istisna varsa o, yoksa varyantın varsayılanı; ikisi de yoksa `null` ve uyarı üretilmez. */
export const DepotStockThresholdSchema = z.object({
  defaultQty: WarehouseVariantThresholdSchema.shape.minStockQty.nullable(),
  overrideQty: WarehouseVariantThresholdSchema.shape.minStockQty.nullable(),
  minStockQty: WarehouseVariantThresholdSchema.shape.minStockQty.nullable(),
});
export type DepotStockThreshold = z.infer<typeof DepotStockThresholdSchema>;

// ── Transfer ────────────────────────────────────────────────────────────────
// Sevk ve kabul iki ayrı andır; yoldaki mal hiçbir deponun stoğunda değildir, bu yüzden sanal "transit depo" yoktur.

export const WarehouseTransferSchema = z.object({
  id: z.string().uuid(),
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
  status: TransferStatusEnum,
  /** TRF-STR-26-0007 — kaynak deponun kodu; kâğıt klasör o depoda durur. */
  referenceNo: z.string(),
  dispatchedBy: z.string().uuid().nullable(),
  dispatchedAt: z.string(),
  receivedBy: z.string().uuid().nullable(),
  receivedAt: z.string().nullable(),
  /** Sevk kaydının geri alınması; "kabul edildi" ile "hiç çıkmamış" aynı şey olmadığı için `received*`'tan ayrıdır. */
  cancelledBy: z.string().uuid().nullable(),
  cancelledAt: z.string().nullable(),
  /** Geri almanın gerekçesi — `note` sevk anının notudur, bu onu iptal eden kararın. */
  cancelReason: z.string().nullable(),
  note: z.string().nullable(),
  /**
   * Yazımın kimliği: istemcide üretilir, cevabı kaybolan istek aynı anahtarla tekrarlanınca veritabanı ikinci yazımı reddeder
   * (`warehouse_transfer_idempotency_key`). `null` korumasız sevktir (elle transfer, besleme) ve meşrudur.
   */
  idempotencyKey: z.string().nullable(),
  createdAt: z.string(),
});
export type WarehouseTransfer = z.infer<typeof WarehouseTransferSchema>;

export const WarehouseTransferLineSchema = z.object({
  id: z.string().uuid(),
  transferId: z.string().uuid(),
  sourceStockId: z.string().uuid(),
  qty: z.number().int(),
  /** Kabulde hedefte doğan YENİ parti (T4: parti kimliği korunur, birleşmez). */
  targetStockId: z.string().uuid().nullable(),
  /** null = henüz kabul edilmedi. 0 = "geldi ama kayıp" — ikisi ayrı şeydir (0042). */
  receivedQty: z.number().int().nullable(),
});
export type WarehouseTransferLine = z.infer<typeof WarehouseTransferLineSchema>;

/** Sevk isteği tek kalemi — hangi partiden ne kadar. */
export const DispatchLineSchema = z.object({
  sourceStockId: z.string().uuid(),
  qty: z.number().int().positive(),
});
export type DispatchLine = z.infer<typeof DispatchLineSchema>;

/**
 * Kabul isteği tek kalemi. `receivedQty` sıfır OLABİLİR ve bu bir beyandır ("sevk edildi ama
 * gelmedi"); satırı hiç göndermemek ise kabulü bloklar — eksik satır transferi kapatamaz.
 */
export const ReceiveLineSchema = z.object({
  lineId: z.string().uuid(),
  receivedQty: z.number().int().nonnegative(),
});
export type ReceiveLine = z.infer<typeof ReceiveLineSchema>;

export const DispatchTransferResultSchema = z.object({
  ok: z.boolean(),
  transferId: z.string().uuid(),
  referenceNo: z.string(),
  /**
   * Bu çağrı yeni sevk yazmadı: aynı anahtarla yazılmış transfer bulundu ve stok ikinci kez düşmedi. İsteğe bağlıdır, çünkü
   * eski kayıtta alan bulunmayabilir; okuyan değerine bakar.
   */
  deduped: z.boolean().optional(),
});
export type DispatchTransferResult = z.infer<typeof DispatchTransferResultSchema>;

export const ReceiveTransferResultSchema = z.object({
  ok: z.boolean(),
  transferId: z.string().uuid(),
  createdBatches: z.number().int(),
  /** Eksik beyan edilen toplam adet; `0` tam kabul, hiçbir düşüm yazılmadı. */
  shortfallQty: z.number().int().nonnegative(),
  /** Eksiğin IMH belgesi (`IMH-STR-26-0013`); eksik yoksa `null`. */
  shortfallReferenceNo: z.string().nullable(),
  /** Fazla beyan edilen toplam adet; `0` sevk edilenden fazlası yok. */
  excessQty: z.number().int().nonnegative(),
  /** Fazlanın SAY belgesi (`count_diff · in`, alan deponun serisi); fazla yoksa `null`. */
  excessReferenceNo: z.string().nullable(),
});
export type ReceiveTransferResult = z.infer<typeof ReceiveTransferResultSchema>;

/** `restoredLines` — kaynağa geri yazılan parti sayısı; ekran "3 parti geri alındı" diyebilsin. */
export const CancelTransferResultSchema = z.object({
  ok: z.boolean(),
  transferId: z.string().uuid(),
  restoredLines: z.number().int(),
});
export type CancelTransferResult = z.infer<typeof CancelTransferResultSchema>;

// ── Tedarik ilerlemesi ──────────────────────────────────────────────────────
// `purchase_order_progress` görünümü: sipariş durumu buradan türer. Ölçü `initialQty`, çünkü `physicalQty` satışla erir.

export const PurchaseOrderProgressSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  purchaseOrderItemId: z.string().uuid(),
  variantId: z.string().uuid(),
  targetWarehouseId: z.string().uuid().nullable(),
  orderedQty: z.number().int(),
  receivedQty: dbNumeric,
  missingQty: dbNumeric,
});
export type PurchaseOrderProgress = z.infer<typeof PurchaseOrderProgressSchema>;
