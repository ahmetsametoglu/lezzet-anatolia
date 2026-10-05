import { z } from 'zod';
import { OrderStatusEnum } from '../primitives/enums.schema';
import { ProductSchema } from './product.schema';
import { ProductVariantSchema } from './product-variant.schema';
import { StorageAreaSchema } from './storage-point.schema';

// Stok partisi (lot), varyant seviyesinde: her partinin kendi son tarihi ve alış maliyeti vardır; ayrılmış miktar burada değil,
// `Reservation` satırlarından türer. Son tarihin tipi üründedir (DLC güvenlik, DDM kalite), alan adı bu yüzden `expiryDate`.

export const StockSchema = z.object({
  id: z.string().uuid(),
  variantId: z.string().uuid(),
  /** PARTİ BİR DEPODA DURUR (DOMAIN §17). `storageAreaId` bundan ayrıdır: o depo İÇİ alandır. */
  warehouseId: z.string().uuid(),
  physicalQty: z.number().int(),
  /** Girişte yazılan miktar — tarihtir, değişmez. Fiili erirken bu durur (fark raporu, tüketim). */
  initialQty: z.number().int(),
  expiryDate: z.string(),
  /**
   * Parti numarası, bizim kimliğimiz (`PRT-STR-26-0031`), veritabanı tetikleyicisi üretir. Lot değildir: lot tedarikçinin üretim
   * numarasıdır ve boş olabilir, parti numarası hep vardır ve benzersizdir.
   */
  batchNo: z.string(),
  lotNumber: z.string().nullable(), // geri çağırmada (rappel) eşleşme anahtarı
  // Para cent (STACK §8); DB kolonları `purchase_price` / `offer_price` euro `numeric`.
  purchasePriceCents: z.number().int().nullable(), // birim (paket) başına alış — gerçek COGS
  intakeId: z.string().uuid().nullable(),
  /** Hangi tedarik kalemini karşıladı (T5) — parçalı kabulde fark raporunun bağı. */
  purchaseOrderItemId: z.string().uuid().nullable(),
  offerPriceCents: z.number().int().nullable(), // dolu → parti indirimli teklifte
  /**
   * Partinin durduğu depo içi alan, serbest metin değil tanımlı kayıt: gruplama yazımla bölünmesin ve "donuk ürün donuk alanda mı"
   * sorulabilsin diye. `null` meşrudur, rafı bilinmeden de mal kabul edilir.
   */
  storageAreaId: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type Stock = z.infer<typeof StockSchema>;

export const StockInsertSchema = z.object({
  variantId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  physicalQty: z.number().int().nonnegative(),
  expiryDate: z.string(),
  lotNumber: z.string().nullish(),
  purchasePriceCents: z.number().int().nonnegative().nullish(),
  intakeId: z.string().uuid().nullish(),
  purchaseOrderItemId: z.string().uuid().nullish(),
  offerPriceCents: z.number().int().nonnegative().nullish(),
  storageAreaId: z.string().uuid().nullish(),
});
export type StockInsert = z.infer<typeof StockInsertSchema>;

/** Parti numarası GÜNCELLENMEZ: kimliktir, tetikleyici verir; şemadan bilerek düşürüldü. */
export const StockUpdateSchema = StockSchema.omit({ batchNo: true }).partial().required({ id: true });
export type StockUpdate = z.infer<typeof StockUpdateSchema>;

/**
 * `available_stock` görünümü: kullanılabilir fiili eksi aktif rezervasyondur ve `expiredDlcQty` bir olgudur, kararı motor verir.
 * Tanesi `(warehouse_id, variant_id)` ve `warehouseId` zorunludur, çünkü alan olmasa iki deponun satırı aynı varyant anahtarına
 * düşerdi.
 */
export const AvailableStockSchema = z.object({
  warehouseId: z.string().uuid(),
  variantId: z.string().uuid(),
  physicalQty: z.number().int(),
  reservedQty: z.number().int(),
  availableQty: z.number().int(),
  expiredDlcQty: z.number().int(),
});
export type AvailableStock = z.infer<typeof AvailableStockSchema>;

/**
 * `available_stock_total`, depo üstü toplam: satış kararı bunu okumaz, çünkü birleştirilmiş stok kimsenin stoğu değildir.
 * Tüketicileri tedarik önerisi ve "hiçbir depoda yok mu" sorusudur; geri çağırma parti tablosunu okur.
 */
export const AvailableStockTotalSchema = AvailableStockSchema.omit({ warehouseId: true });
export type AvailableStockTotal = z.infer<typeof AvailableStockTotalSchema>;

/**
 * Parti ve raf ömrü kararının ürün alanları (`date_type`, `shelf_life_days`) tek sorguda, gömülü `select` ile; karar motorundur
 * (`domain-core/stock/shelf-life`), servis satırı getirir.
 */
/**
 * Partinin alanı gömülü hâliyle; üç okuma (FEFO önerisi, toplama, varyant geçmişi) aynı alanları adıyla ister ve tanım tek
 * yerdedir.
 */
export const StockAreaEmbedSchema = StorageAreaSchema.pick({
  id: true,
  name: true,
  kind: true,
  // Yürüyüş sırası: toplama listesi kalemleri bu sayıya göre dizilir, depocu raflar arasında zikzak çizmez.
  sortOrder: true,
}).nullable();

/** Parti + yalnız alanı — varyant geçmişinin okuduğu şekil (ürün alanları gerekmiyor). */
export const StockWithAreaSchema = StockSchema.extend({ storageArea: StockAreaEmbedSchema });
export type StockWithArea = z.infer<typeof StockWithAreaSchema>;

export const StockWithProductDatesSchema = StockSchema.extend({
  variant: z.object({
    id: z.string().uuid(),
    product: z.object({
      dateType: z.enum(['DLC', 'DDM']),
      shelfLifeDays: z.number().int().nullable(),
    }),
  }),
  storageArea: StockAreaEmbedSchema,
});
export type StockWithProductDates = z.infer<typeof StockWithProductDatesSchema>;

/**
 * Parti ve kimin partisi olduğu, stok ekranı için: ekran "Fıstıklı Baklava · 1 kg · LOT-2451-A" yazabilmek için ad alanlarını
 * gömülü `select` ile alır. `productId` partiden ürüne geçişin köprüsüdür.
 */
export const StockBatchDetailSchema = StockSchema.extend({
  // Gömülü satırlar VARLIK ŞEMASINDAN türetilir (CLAUDE.md §1), elle yazılmaz. Elle yazıldığında
  // biri sıkı öbürü gevşek olabiliyor ve fark ancak ÇALIŞIRKEN görülüyor: boy etiketi tek boylu
  // üründe bilinçli olarak BOŞTUR (`LocalizedTextDraftSchema`), burada `LocalizedTextSchema` yazılıydı
  // ve o ürünün partisi okunduğu anda ekran Zod hatasıyla düşüyordu.
  variant: ProductVariantSchema.pick({ id: true, label: true }).extend({
    product: ProductSchema.pick({
      id: true,
      name: true,
      categoryId: true,
      dateType: true,
      shelfLifeDays: true,
      /**
       * KDV oranı — teklif kararının KÂR yüzünde zorunlu. Teklif fiyatı b2c tabanındadır (KDV DAHİL),
       * alış fiyatı ise hariç: ikisini doğrudan karşılaştırmak marjı KDV oranı kadar şişirirdi.
       */
      vatRate: true,
    }),
  }),
  /** Partinin alanı, ad gömülü gelir: okuyan her yer rafta aranacak tabelayı ister; `null` rafı bilinmeyen partidir. */
  storageArea: StockAreaEmbedSchema,
});
export type StockBatchDetail = z.infer<typeof StockBatchDetailSchema>;

/**
 * Geri çağırma sorgusunun tek satırı, "bu partiden çıkan mal kime gitti": zincir hazırlık kayıtlarından türer, çünkü depocu hangi
 * partiden ne çıkardığını onaylar. `referenceNo` taslak siparişte boş olabilir; satır yine görünür ve telefon müşteriye ulaşmanın
 * aracıdır.
 */
export const RecallHitSchema = z.object({
  orderId: z.string().uuid(),
  referenceNo: z.string().nullable(),
  orderCreatedAt: z.string(),
  orderStatus: OrderStatusEnum,
  customerId: z.string().uuid(),
  customerName: z.string(),
  customerPhone: z.string().nullable(),
  /** Bu siparişe bu partiden çıkan miktar (hazırlık kaydından). */
  qty: z.number().int(),
});
export type RecallHit = z.infer<typeof RecallHitSchema>;

// Ayırma (DOMAIN §4), her ayırma bir satır; `stockId` yalnız partiye çıpalı teklif satırında, `expiresAt` yalnız online checkout
// süresinde dolar.

export const ReservationSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  variantId: z.string().uuid(),
  /**
   * Rezervasyon depoyu AÇIKÇA taşır (T1) — türetme ilkesinin gerekçeli istisnası: normal
   * rezervasyonun partisi yoktur (parti seçimi hazırlıkta) ve siparişten türetmek `available_stock`
   * sıcak yoluna join eklerdi. Siparişin deposuyla eşitliği DB kısıtı tutar (0042, iki yönlü).
   */
  warehouseId: z.string().uuid(),
  stockId: z.string().uuid().nullable(),
  qty: z.number().int(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Reservation = z.infer<typeof ReservationSchema>;

export const ReservationInsertSchema = z.object({
  orderId: z.string().uuid(),
  variantId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  stockId: z.string().uuid().nullish(),
  qty: z.number().int().positive(),
  expiresAt: z.string().nullish(),
});
export type ReservationInsert = z.infer<typeof ReservationInsertSchema>;

export const ReservationUpdateSchema = ReservationSchema.partial().required({ id: true });
export type ReservationUpdate = z.infer<typeof ReservationUpdateSchema>;

/** `reserve_stock` RPC'sinin dönüşü: ayırma atomiktir, yetmezse satır yazılmaz ve kalan `available` bildirilir. */
export const ReserveResultSchema = z.object({
  ok: z.boolean(),
  reservationId: z.string().uuid().nullable(),
  available: z.number().int(),
});
export type ReserveResult = z.infer<typeof ReserveResultSchema>;
