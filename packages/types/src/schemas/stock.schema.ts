import { z } from 'zod';

// Stock — stok PARTİSİ (lot). Stok varyant seviyesinde tutulur; her partinin kendi son tarihi ve
// alış maliyeti vardır (DOMAIN §4, data-model/stok-tedarik.md).
//
// Ayrılmış miktar burada YOK: `Reservation` satırlarından türetilir (sayaç tutulmaz).
// Son tarihin TİPİ üründedir (`Product.date_type`) — bu yüzden alan adı tipten bağımsız:
// `expiryDate`. DLC = güvenlik (geçince satılamaz), DDM = kalite (geçse de satılır).

// PG numeric supabase-js'te string dönebilir → number'a indir (okuma tarafı).
const dbNumeric = z.union([z.number(), z.string()]).transform((v) => Number(v));

export const StockSchema = z.object({
  id: z.string().uuid(),
  variantId: z.string().uuid(),
  physicalQty: z.number().int(),
  /** Girişte yazılan miktar — tarihtir, değişmez. Fiili erirken bu durur (fark raporu, tüketim). */
  initialQty: z.number().int(),
  expiryDate: z.string(),
  lotNumber: z.string().nullable(), // geri çağırmada (rappel) eşleşme anahtarı
  purchasePrice: dbNumeric.nullable(), // birim (paket) başına alış — gerçek COGS
  intakeId: z.string().uuid().nullable(),
  offerPrice: dbNumeric.nullable(), // dolu → parti indirimli teklifte
  location: z.string().nullable(),
  createdAt: z.string(),
});
export type Stock = z.infer<typeof StockSchema>;

export const StockInsertSchema = z.object({
  variantId: z.string().uuid(),
  physicalQty: z.number().int().nonnegative(),
  expiryDate: z.string(),
  lotNumber: z.string().nullish(),
  purchasePrice: z.number().nonnegative().nullish(),
  intakeId: z.string().uuid().nullish(),
  offerPrice: z.number().nonnegative().nullish(),
  location: z.string().nullish(),
});
export type StockInsert = z.infer<typeof StockInsertSchema>;

export const StockUpdateSchema = StockSchema.partial().required({ id: true });
export type StockUpdate = z.infer<typeof StockUpdateSchema>;

/**
 * `available_stock` görünümü — kullanılabilir = fiili − aktif rezervasyon (süresi dolan sayılmaz).
 * Görünüm karar vermez: `expiredDlcQty` bir olgudur ("tarihi geçmiş DLC partilerde ne kadar var"),
 * "satma" kararını motor verir.
 */
export const AvailableStockSchema = z.object({
  variantId: z.string().uuid(),
  physicalQty: z.number().int(),
  reservedQty: z.number().int(),
  availableQty: z.number().int(),
  expiredDlcQty: z.number().int(),
});
export type AvailableStock = z.infer<typeof AvailableStockSchema>;

/**
 * Parti + kararın ihtiyaç duyduğu ürün alanları, TEK sorguda. Raf ömrü kararları (satılabilir mi,
 * yaklaşan mı, MLOR) `date_type` ve `shelf_life_days` ister; bunlar üründedir. Parti başına ayrı
 * ürün sorgusu (N+1) yerine gömülü `select` ile gelir (STACK §13). Karar yine motorundur
 * (`domain-core/stock/shelf-life`) — servis yalnız satırı getirir.
 */
export const StockWithProductDatesSchema = StockSchema.extend({
  variant: z.object({
    id: z.string().uuid(),
    product: z.object({
      dateType: z.enum(['DLC', 'DDM']),
      shelfLifeDays: z.number().int().nullable(),
    }),
  }),
});
export type StockWithProductDates = z.infer<typeof StockWithProductDatesSchema>;

// Reservation — her ayırma bir satır. Kurallar: DOMAIN §4.
// `stockId` YALNIZ partiye çıpalı teklif satırında dolar; `expiresAt` yalnız online checkout TTL'inde.

export const ReservationSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  variantId: z.string().uuid(),
  stockId: z.string().uuid().nullable(),
  qty: z.number().int(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Reservation = z.infer<typeof ReservationSchema>;

export const ReservationInsertSchema = z.object({
  orderId: z.string().uuid(),
  variantId: z.string().uuid(),
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
