import { z } from 'zod';
import { dbNumeric, dbNumericNullable } from '../primitives/db-numeric';
import { CountryEnum, TransferStatusEnum, WarehouseKindEnum } from '../primitives/enums.schema';

// Depo ağı şemaları (DOMAIN §17, data-model/depo.md). Sistem tek depo varsayımıyla kuruldu;
// bu dosya o varsayımın kalktığı yerdir.
//
// Depo müşteriye GÖSTERİLMEZ — altın kural: sistemin karmaşıklığı arayüze yansımaz. Müşteri posta
// kodunu girer, gerisi içeride çözülür (posta kodu → bölge → depo).

// ── Warehouse ───────────────────────────────────────────────────────────────

export const WarehouseSchema = z.object({
  id: z.string().uuid(),
  /** Belge numarasına ve ekrana giren kısa kod ('STR'). `IMH-STR-26-0012` elle yazılacak kadar kısa. */
  code: z.string(),
  name: z.string(),
  /**
   * Tesis mi, kurye aracı mı (26.08). Araç bir YERDİR — yüklenir, sayılır, transfer alır ve
   * içinden satış yapılır; ölçüm noktası kimliği (`vehicle`, 0045) ayrı yaşar.
   *
   * Okuyan tarafın bilmesi gereken dört sonuç: araca bölge bağlanamaz, araç kargo deposu olamaz,
   * araç `available_stock_total`a girmez (üçü de veride zorlanıyor) — ve araç bir SEÇENEK değildir:
   * seçici, süzgeç ve yazma hedefi yalnız tesis sunar (02.09, `data-model/depo.md`).
   */
  kind: WarehouseKindEnum,
  /**
   * **Aracın evi olan tesis** (02.09) — yalnız `kind='vehicle'` satırında dolu, tesiste daima `null`.
   *
   * Araç gezen bir yerdir: sabah bir tesisten çıkar, akşam ona döner. Tesisin paneli *"aracımda ek
   * olarak ne var"* diyebilsin diye bu bağ veride duruyor — türetilmiş hâli ("son transferi kim
   * yaptı", "hangi kuryenin kapsamında") yalnız genelde doğrudur ve depo kararlarında genelde doğru
   * yetmez. Evin tesis olması tetikleyiciyle zorlanır (`warehouse_home_is_facility`).
   */
  homeWarehouseId: z.string().uuid().nullable(),
  /**
   * Deponun ülkesi — FİZİKSEL tesis nerede. Bölgenin ülkesiyle karıştırılmamalı: bir bölge sınır
   * ötesi olabilir (ADR-002), depo olamaz. KDV'nin bağlı olduğu alan da budur (DOMAIN §5/§17).
   * Araçta da doludur: araç bir ülkenin içinde dolaşır, sınır geçmez.
   */
  countryCode: CountryEnum,
  address: z.record(z.unknown()).nullable(),
  /**
   * Deponun coğrafi noktası (11.9) — kapalı turun başlangıcı ve bitişi. `address` jsonb'sinin içine
   * gömülmedi: gömülü sayı kısıt taşıyamaz ve rotanın çıpası için bu kabul edilemez.
   *
   * `null` = nokta girilmemiş. Sıralama motoru o depo için çalışmayı **reddeder** (`no_start`) —
   * varsayılan bir merkez uydurmaz. Nokta operatörün haritada onayladığı noktadır, o yüzden
   * `address`teki gibi kademe/kaynak alanı yok: kademesi her zaman "insan onayladı".
   */
  lat: dbNumericNullable,
  lng: dbNumericNullable,
  /** Kargo çıkış deposu. Ülke başına en fazla bir aktif tane — kural veritabanında (0042). */
  shipsOnline: z.boolean(),
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
  countryCode: CountryEnum.optional(),
  address: z.record(z.unknown()).nullish(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  shipsOnline: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
export type WarehouseInsert = z.infer<typeof WarehouseInsertSchema>;

export const WarehouseUpdateSchema = WarehouseSchema.partial().required({ id: true });
export type WarehouseUpdate = z.infer<typeof WarehouseUpdateSchema>;

// ── Vehicle — KALDIRILDI (02.11, 03.08) ─────────────────────────────────────
// Şema `vehicle` tablosuyla birlikte düştü: tablonun servisi yoktu, `from('vehicle')` hiçbir yerde
// geçmiyordu ve hiçbir tasarım sayfası aracı bir VARLIK olarak kullanmıyordu.
//
// Tip tek başına bırakılsaydı daha kötü olurdu: karşılığı olmayan bir `Vehicle` tipi, okuyanı
// "araçlar sistemde tutuluyor" diye inandırır ve ilk kullananı çalışma zamanında (tablo yok)
// karşılar. Gerekçe: `data-model/depo.md` › Vehicle.

// ── Depo bazlı asgari stok eşiği (C6) ───────────────────────────────────────
// Varyanttaki `minStockQty` VARSAYILAN kalır; bu satır yalnız İSTİSNA yazar (fiyatın
// müşteriye-özel satır deseni). Satır yoksa genel eşik işler.

export const WarehouseVariantThresholdSchema = z.object({
  warehouseId: z.string().uuid(),
  variantId: z.string().uuid(),
  minStockQty: z.number().int().nonnegative(),
});
export type WarehouseVariantThreshold = z.infer<typeof WarehouseVariantThresholdSchema>;

// Ayrı bir `Insert` şeması YOK: üç alanın üçü de zorunlu — yazım ile okuma aynı şekil.

// ── Transfer (K11, T4) ──────────────────────────────────────────────────────
// İki fiziksel-gerçek an: sevk → kabul. Yoldaki mal hiçbir depoda satılamaz çünkü hiçbir deponun
// stoğunda değildir — sanal "transit depo" yoktur, "yolda ne var" bu kaydın kendisidir.

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
  /** Sevk kaydının geri alınması (19.6) — `received*`'tan AYRI: "kabul edildi" ile "hiç çıkmamış" aynı şey değil. */
  cancelledBy: z.string().uuid().nullable(),
  cancelledAt: z.string().nullable(),
  /** Geri almanın gerekçesi — `note` sevk anının notudur, bu onu iptal eden kararın. */
  cancelReason: z.string().nullable(),
  note: z.string().nullable(),
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
});
export type DispatchTransferResult = z.infer<typeof DispatchTransferResultSchema>;

export const ReceiveTransferResultSchema = z.object({
  ok: z.boolean(),
  transferId: z.string().uuid(),
  createdBatches: z.number().int(),
});
export type ReceiveTransferResult = z.infer<typeof ReceiveTransferResultSchema>;

/** `restoredLines` — kaynağa geri yazılan parti sayısı; ekran "3 parti geri alındı" diyebilsin. */
export const CancelTransferResultSchema = z.object({
  ok: z.boolean(),
  transferId: z.string().uuid(),
  restoredLines: z.number().int(),
});
export type CancelTransferResult = z.infer<typeof CancelTransferResultSchema>;

// ── Tedarik ilerlemesi (K6) ─────────────────────────────────────────────────
// `purchase_order_progress` görünümü: PO durumu saklanan sayaçtan değil BURADAN türer. Ölçü
// `initialQty` — `physicalQty` satışla erir ve "ne kadar geldi" sorusuna yanlış cevap verir.

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
