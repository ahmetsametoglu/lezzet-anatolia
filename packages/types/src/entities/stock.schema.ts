import { z } from 'zod';
import { OrderStatusEnum } from '../primitives/enums.schema';
import { ProductSchema } from './product.schema';
import { ProductVariantSchema } from './product-variant.schema';
import { StorageAreaSchema } from './storage-point.schema';

// Stock — stok PARTİSİ (lot). Stok varyant seviyesinde tutulur; her partinin kendi son tarihi ve
// alış maliyeti vardır (DOMAIN §4, data-model/stok-tedarik.md).
//
// Ayrılmış miktar burada YOK: `Reservation` satırlarından türetilir (sayaç tutulmaz).
// Son tarihin TİPİ üründedir (`Product.date_type`) — bu yüzden alan adı tipten bağımsız:
// `expiryDate`. DLC = güvenlik (geçince satılamaz), DDM = kalite (geçse de satılır).

export const StockSchema = z.object({
  id: z.string().uuid(),
  variantId: z.string().uuid(),
  /** PARTİ BİR DEPODA DURUR (DOMAIN §17). `storageAreaId` bundan ayrıdır: o depo İÇİ alandır. */
  warehouseId: z.string().uuid(),
  physicalQty: z.number().int(),
  /** Girişte yazılan miktar — tarihtir, değişmez. Fiili erirken bu durur (fark raporu, tüketim). */
  initialQty: z.number().int(),
  expiryDate: z.string(),
  lotNumber: z.string().nullable(), // geri çağırmada (rappel) eşleşme anahtarı
  // Para **cent** (02.9 · STACK §8); DB kolonları `purchase_price` / `offer_price` euro `numeric`.
  purchasePriceCents: z.number().int().nullable(), // birim (paket) başına alış — gerçek COGS
  intakeId: z.string().uuid().nullable(),
  /** Hangi tedarik kalemini karşıladı (T5) — parçalı kabulde fark raporunun bağı. */
  purchaseOrderItemId: z.string().uuid().nullable(),
  offerPriceCents: z.number().int().nullable(), // dolu → parti indirimli teklifte
  /**
   * Partinin durduğu depo İÇİ alan (`StorageArea`) — **serbest metin değil, tanımlı kayıt** (19.29).
   *
   * Önce `location: string` idi ve `temperature_log`un kapattığı üç zarar burada aynen geçerliydi:
   * gruplama yazımla bölünüyordu, "hangi alan boş/dolu" sorusu sorulamıyordu, ve `storage_area.kind`
   * ile `product.storageType` aynı kelimeleri konuşmasına rağmen "donuk ürün donuk alanda mı" sorusu
   * cevapsızdı — cümlenin öteki yarısı bu alandı.
   *
   * `null` meşru: rafı bilinmeden de mal kabul edilir.
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

export const StockUpdateSchema = StockSchema.partial().required({ id: true });
export type StockUpdate = z.infer<typeof StockUpdateSchema>;

/**
 * `available_stock` görünümü — kullanılabilir = fiili − aktif rezervasyon (süresi dolan sayılmaz).
 * Görünüm karar vermez: `expiredDlcQty` bir olgudur ("tarihi geçmiş DLC partilerde ne kadar var"),
 * "satma" kararını motor verir.
 *
 * **Grain `(warehouse_id, variant_id)` — `warehouseId` ZORUNLU alan (T8).** Bu, geçişin en riskli
 * sessiz bozulmasının panzehiridir: alan olmasaydı iki deponun satırı aynı varyant anahtarına
 * düşer ve `Map`'te SON DEPO KAZANIRDI — kimse fark etmeden yanlış stok gösterilirdi. Zorunlu alan
 * o kırılmayı gürültülü hale getirir.
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
 * `available_stock_total` — depo-üstü toplam. SATIŞ KARARI BUNU OKUMAZ: birleştirilmiş stok
 * kimsenin stoğu değildir (3 STR'de + 2 KEHL'de duran maldan 5 kişilik sipariş çıkmaz).
 * Tüketicileri: tedarik önerisi ve "hiçbir depoda yok mu" sorusu (C3 — ziyaretçiye 'tükendi'
 * demenin tek meşru dayanağı). Geri çağırma bunu değil parti tablosunu okur (0042 notu).
 */
export const AvailableStockTotalSchema = AvailableStockSchema.omit({ warehouseId: true });
export type AvailableStockTotal = z.infer<typeof AvailableStockTotalSchema>;

/**
 * Parti + kararın ihtiyaç duyduğu ürün alanları, TEK sorguda. Raf ömrü kararları (satılabilir mi,
 * yaklaşan mı, MLOR) `date_type` ve `shelf_life_days` ister; bunlar üründedir. Parti başına ayrı
 * ürün sorgusu (N+1) yerine gömülü `select` ile gelir (STACK §13). Karar yine motorundur
 * (`domain-core/stock/shelf-life`) — servis yalnız satırı getirir.
 */
/**
 * Partinin alanı, GÖMÜLÜ hâliyle (19.29) — üç ayrı okuma aynı üç alanı istiyor (FEFO önerisi,
 * toplama, varyant geçmişi) ve hepsi ADI kullanıyor. Tek yerde tanımlı: üç şemada elle
 * tekrarlansaydı biri bir gün `kind`ı unutur ve o ekran uyumsuzluk uyarısını kuramazdı.
 */
export const StockAreaEmbedSchema = StorageAreaSchema.pick({ id: true, name: true, kind: true }).nullable();

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
 * Parti + KİMİN partisi olduğu (09.13 stok ekranı). `StockWithProductDates`'in üstüne yalnız ad
 * alanlarını ekler — ekran "Fıstıklı Baklava · 1 kg · LOT-2451-A" yazabilmek için varyantın boy adını
 * ve ürünün adını ister; parti başına ayrı ürün sorgusu (N+1) yerine gömülü `select` ile gelir.
 *
 * `productId` ekranın köprüsüdür: partiden ürüne (oradan fiyata, pakete) geçilir.
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
  /**
   * Partinin alanı — **ad gömülü geliyor** (19.29). Okuyan her yer (FEFO önerisi, toplama ekranı,
   * varyant geçmişi) rafta aranacak TABELAYI istiyor; kimliği ayrıca çözmek her ekranda ikinci bir
   * okuma demekti. `null` = rafı bilinmeyen parti (kabulde alan seçmek zorunlu değil).
   */
  storageArea: StockAreaEmbedSchema,
});
export type StockBatchDetail = z.infer<typeof StockBatchDetailSchema>;

/**
 * Geri çağırma (rappel) sorgusunun TEK satırı: "bu partiden çıkan mal kime gitti".
 *
 * Türetme yönü hazırlık kayıtlarındandır (`OrderItemBatch`): depocu hangi partiden ne kadar
 * çıkardığını onayladığı için zincir gerçektir, tahmin değil. Tedarikçi bir lotu geri çağırdığında
 * cevap dakikalar içinde verilmelidir — sorgu bu yüzden tek turda çalışır.
 *
 * `referenceNo` null olabilir: referans ilk KALICI durumda üretilir, taslak siparişte henüz yoktur.
 * O satır yine görünür — ekran o zaman müşterinin adıyla söyler. Telefon geri çağırmanın çalışma
 * aracıdır: müşteriye ulaşmak gerekir.
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

// Reservation — her ayırma bir satır. Kurallar: DOMAIN §4.
// `stockId` YALNIZ partiye çıpalı teklif satırında dolar; `expiresAt` yalnız online checkout TTL'inde.

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

/**
 * `reserve_stock` RPC'sinin dönüşü — atomik ayırma (06.3). Yetmezse satır YAZILMAZ ve
 * `available` ile ne kadar kaldığı bildirilir; kısmi ayırma yoktur (DOMAIN §4).
 */
export const ReserveResultSchema = z.object({
  ok: z.boolean(),
  reservationId: z.string().uuid().nullable(),
  available: z.number().int(),
});
export type ReserveResult = z.infer<typeof ReserveResultSchema>;
