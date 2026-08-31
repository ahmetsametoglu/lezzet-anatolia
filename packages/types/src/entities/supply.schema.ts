import { z } from 'zod';

// Tedarik zinciri şemaları (DOMAIN §16, data-model/stok-tedarik.md): tedarikçi kartı,
// ürün–kod eşlemesi, tedarik siparişi ve mal kabul. Müşteri tarafının simetriği.
//
// Para alanları **cent** (02.9 · STACK §8); DB kolonları euro `numeric` ve çevrimi servis yapıyor
// (`moneyFields`). `dbNumeric` bu dosyada artık YOK: tedarik ailesinde numeric taşıyan tek şey
// paraydı — oran ya da ölçü alanı bulunmuyor.

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
 * `partially_received` (K6): tek tedarik siparişi birden çok depoda parça parça kabul edilebilir —
 * ilk kabul siparişi KAPATMAZ. Durum saklanan bir sayaçtan değil kabullerden TÜRETİLİR
 * (`purchase_order_progress`); bu enum yalnız türetilmiş sonucu taşır.
 */
export const PurchaseOrderStatusEnum = z.enum(['draft', 'sent', 'partially_received', 'received', 'cancelled']);
export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatusEnum>;

export const PurchaseOrderSchema = z.object({
  id: z.string().uuid(),
  supplierId: z.string().uuid(),
  status: PurchaseOrderStatusEnum,
  /**
   * İnsan-okur numara (`TS-26-4K2M9P`) — **taslakta null, gönderimde dolu.**
   *
   * Belge dışarı çıkıyor (tedarikçiye WhatsApp/PDF), yani karşı tarafın referans verebileceği bir
   * numara gerekiyor; fatura eşleştirmede siparişi faturayla bağlayan da bu olacak. Rastgele,
   * sıralı değil: sıralı numara dışarıya iş hacmimizi söyler.
   */
  referenceNo: z.string().nullable(),
  sentAt: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type PurchaseOrder = z.infer<typeof PurchaseOrderSchema>;

/**
 * Tedarik siparişi LİSTE satırı (09.14) — ekranın bir satırda sorduğu her şey, tek turda.
 *
 * ── NEDEN RPC DEĞİL ──────────────────────────────────────────────────────────
 * `STACK §13`: okuma RPC'si istisnadır ve N+1'i kırmanın **ilk** aracı PostgREST'in gömülü
 * `select`'idir. Buradaki tüm bağlar gerçek yabancı anahtar (`stock → purchase_order_item`,
 * `stock → warehouse`, `purchase_order → supplier`), yani sorgu kurucusu zinciri ifade edebiliyor —
 * eşik geçilmiyor. Toplamlar okunan sayfanın satırlarında yapılır: sayfa 20 satırsa toplama da
 * 20 satırlıktır, veriyle büyümez.
 *
 * **Ham sayılar taşınır, karar taşınmaz.** "Tamamlandı mı", "geç kaldı mı" gibi yargılar burada
 * YOK; şema yalnız kalemleri ve gelen partileri getirir, özeti `domain-core` türetir (`STACK §4`).
 */
export const PurchaseOrderRowSchema = PurchaseOrderSchema.extend({
  /** Tedarikçi — satırın başlığı; ad olmadan sipariş listesi okunmaz. */
  supplier: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
  items: z.array(
    z.object({
      id: z.string().uuid(),
      qty: z.number().int(),
      /**
       * Beklenen alış (**cent**); **null olabilir** ve o zaman sipariş tutarı EKSİKTİR (ekran "≈" der).
       *
       * Kalem GÖMÜLÜ bir ilişkiden geliyor (`items:purchase_order_item(...)`), yani `moneyFields`
       * buraya inmez — üst düzey servisin kendi tablosudur (`STACK §8`). Çevrim okumanın sınırında,
       * `PurchaseOrderService.listRows` içinde yapılıyor.
       */
      unitPriceCents: z.number().int().nullable(),
      /**
       * Bu kaleme karşılık FİİLEN giren partiler.
       *
       * Depo kırılımı buradan çıkar, `purchase_order_item.target_warehouse_id`'den DEĞİL: o alan bir
       * niyet beyanıdır, kısıt değil (K6) — mal fiilen nereye indiyse oraya girer. Hedefi okumak
       * "planlanan"ı "gerçekleşen" diye göstermek olurdu.
       *
       * Ölçü `initialQty`: `physicalQty` satışla erir ve "ne kadar geldi" sorusuna yanlış cevap
       * verir (`purchase_order_progress` da bu yüzden `initial_qty` sayıyor).
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
  /** Beklenen alış (**cent**) — kolon `unit_price` (euro numeric). */
  unitPriceCents: z.number().int().nullable(),
  /**
   * İSTEĞE BAĞLI hedef depo (C7): "20 koli STR'ye, 10 koli KEHL'e" — tedarikçi listesine yazılır,
   * kabul eden depocu kendi payını listeden okur. Boşsa hedefi kabul eden depo söyler; niyet
   * beyanıdır, kısıt değil — mal fiilen nereye indiyse oraya girer.
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
   * **Mal kabul depoya yapılır** (K6): satın alma siparişi depo-üstüdür ama mal bir kapıdan girer.
   * Depo bağı PO'ya değil BURAYA takılır — aynı PO'nun ikinci kabulü başka depoda olabilir.
   */
  warehouseId: z.string().uuid(),
  date: z.string(),
  /** Kalemlerden hesaplanır (Σ birim maliyet × adet) — **cent**; kolon `total_amount` (euro). */
  totalAmountCents: z.number().int(),
  note: z.string().nullable(),
  /**
   * **Kabulü yapan personel** (`user_profiles.id`) — kullanıcı kararı 31.08.
   *
   * NULLABLE ve öyle kalmalı: seed ve bakım yolları aktörsüz yazar, orada gerçek bir kişi yok.
   * Boş olması "bilinmiyor" demektir — sıfır ya da bir varsayılan kimlik yazmak, defterin
   * bilmediğini biliyormuş gibi göstermesi olurdu (CLAUDE §1).
   *
   * Aynı kimlik doğan HER harekete de yazılıyor (`stock_movement.actor_id`); belgede durması
   * "kim aldı" sorusunu hareketlerden türetmeyi gereksiz kılıyor.
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
   * Birim (paket) başına alış maliyeti (**cent**) — gerçek COGS bundan çıkar.
   *
   * RPC girdisidir (`receive_intake.p_lines`) ve fonksiyon euro `numeric` bekler; cent→euro çevrimi
   * servis sınırında yapılır (`StockIntakeService.receive`). Alan yine `…Cents` adını taşır: adı
   * euro bırakmak, uygulamanın tek birimini (cent) kapıya kadar taşıyıp orada bozmak olurdu.
   */
  unitCostCents: z.number().int().nonnegative().nullish(),
  /** Partinin konacağı depo İÇİ alan — serbest metin değil kimlik (19.29, `storage_area`). */
  storageAreaId: z.string().uuid().nullish(),
  /**
   * Hangi PO kalemini karşılıyor (T5). PO'lu kabulde ZORUNLU ama yazılması şart değil: boş
   * bırakılırsa RPC varyanttan çözer, belirsizse (aynı varyant iki kalemde) hata verir. Bağsız
   * kabul PO'yu sonsuza dek açık bırakırdı — ölçüm yokken "0 geldi" demek olurdu.
   */
  purchaseOrderItemId: z.string().uuid().nullish(),
});
export type IntakeLine = z.infer<typeof IntakeLineSchema>;

/** `receive_intake` dönüşü — giriş + partiler + PO kapanışı tek transaction'da (06.10). */
export const ReceiveIntakeResultSchema = z.object({
  ok: z.boolean(),
  intakeId: z.string().uuid(),
  stockIds: z.array(z.string().uuid()),
  /** Girişin toplamı (**cent**) — RPC jsonb'si euro döner, çevrim servis sınırında (`STACK §8`). */
  totalAmountCents: z.number().int(),
});
export type ReceiveIntakeResult = z.infer<typeof ReceiveIntakeResultSchema>;
