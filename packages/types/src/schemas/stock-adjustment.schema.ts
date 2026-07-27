import { z } from 'zod';

// StockAdjustment — stok azalışının SATIŞ DIŞI her sebebi (DOMAIN §4, §12). Kayıp görünmezse
// yönetilemez: "bu üründen yılda ne kadar çöpe attım" sorusunun tek cevabı bu tablodur.

const dbNumeric = z.union([z.number(), z.string()]).transform((v) => Number(v));

export const StockAdjustmentReasonEnum = z.enum([
  'expired', // DLC geçti → imha
  'damaged', // hasar / soğuk zincir kırıldı
  'count_diff', // sayım farkı (iki yönlü)
  'lost', // kayıp
  'return_restock', // teslim-sonrası iade stoğa döndü — istisnadır, sebep notu zorunlu
]);
export type StockAdjustmentReason = z.infer<typeof StockAdjustmentReasonEnum>;

export const StockAdjustmentSchema = z.object({
  id: z.string().uuid(),
  stockId: z.string().uuid(),
  /** İŞARETLİ: + stoktan düşüm, − stoğa geri ekleme. Net kayıp tek toplamla çıksın diye tek alan. */
  qty: z.number().int(),
  reason: StockAdjustmentReasonEnum,
  /** Partinin alış fiyatı, işlem anında kopyalanır — parti sonradan düzeltilse fire maliyeti kaymaz. */
  unitCost: dbNumeric.nullable(),
  note: z.string().nullable(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type StockAdjustment = z.infer<typeof StockAdjustmentSchema>;

export const StockAdjustmentInsertSchema = z.object({
  stockId: z.string().uuid(),
  qty: z.number().int(),
  reason: StockAdjustmentReasonEnum,
  unitCost: z.number().nullish(),
  note: z.string().nullish(),
  createdBy: z.string().uuid().nullish(),
});
export type StockAdjustmentInsert = z.infer<typeof StockAdjustmentInsertSchema>;

export const StockAdjustmentUpdateSchema = StockAdjustmentSchema.partial().required({ id: true });
export type StockAdjustmentUpdate = z.infer<typeof StockAdjustmentUpdateSchema>;

/** `adjust_stock` RPC'sinin dönüşü — kayıt + fiili düşüm tek transaction'da (06.6). */
export const AdjustResultSchema = z.object({
  ok: z.boolean(),
  adjustmentId: z.string().uuid(),
  remainingQty: z.number().int(),
});
export type AdjustResult = z.infer<typeof AdjustResultSchema>;

// TemperatureLog — hijyen denetiminin ilk istediği veri. Sensör yok, elle giriş (DOMAIN §4).

export const TemperatureLogSchema = z.object({
  id: z.string().uuid(),
  location: z.string(),
  temperatureC: dbNumeric,
  recordedBy: z.string().uuid().nullable(),
  recordedAt: z.string(),
});
export type TemperatureLog = z.infer<typeof TemperatureLogSchema>;

export const TemperatureLogInsertSchema = z.object({
  location: z.string().min(1),
  temperatureC: z.number(),
  recordedBy: z.string().uuid().nullish(),
  recordedAt: z.string().optional(),
});
export type TemperatureLogInsert = z.infer<typeof TemperatureLogInsertSchema>;

export const TemperatureLogUpdateSchema = TemperatureLogSchema.partial().required({ id: true });
export type TemperatureLogUpdate = z.infer<typeof TemperatureLogUpdateSchema>;
