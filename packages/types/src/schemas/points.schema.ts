import { z } from 'zod';
import { PointsReasonEnum } from './enums.schema';

// PointsEntry — sadakat puanı defteri (17.4, migration 0037). DOMAIN §14.
//
// **Defter, sayaç değil.** Bakiye = Σ `points` ve hiçbir yerde saklanmaz; `MoneyMovement` ↔ hesap
// bakiyesi ile aynı desen. Saklanan bir bakiye, iptal edilen bir kazanımdan sonra düzeltilmeyi
// unutan tek bir yolla kalıcı olarak yanlışa döner — ve puan müşteri için para gibidir.

export const PointsEntrySchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  /** Delta: + kazanım, − harcama. Sıfır olamaz. */
  points: z.number().int(),
  reason: PointsReasonEnum,
  /**
   * İlgili kayıt (`product_feedback.id`, `order.id`, `discount.id`…). FK YOK: tek kolon birden çok
   * tabloyu işaret ediyor — bu bir İZ, üzerinden join yapılacak bir bağ değil.
   */
  refId: z.string().uuid().nullable(),
  /** Serbest sebep — yalnız `manual`'da: "gecikme telafisi — jest". */
  note: z.string().nullable(),
  /** Elle girişte personel; sistemin verdiği puanda boş. */
  createdBy: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type PointsEntry = z.infer<typeof PointsEntrySchema>;

export const PointsEntryInsertSchema = z.object({
  customerId: z.string().uuid(),
  points: z.number().int().refine((v) => v !== 0, { message: 'Puan hareketi sıfır olamaz' }),
  reason: PointsReasonEnum,
  refId: z.string().uuid().nullish(),
  note: z.string().nullish(),
  createdBy: z.string().uuid().nullish(),
});
export type PointsEntryInsert = z.infer<typeof PointsEntryInsertSchema>;

/**
 * `customer_points_balance` görünümü — defterden türetilen bakiye.
 *
 * `earned`/`spent` ayrı durur çünkü müşteri ekranı "topladın / harcadın" der; tek bir net sayı,
 * kazanımın büyüklüğünü görünmez kılardı.
 */
export const PointsBalanceSchema = z.object({
  customerId: z.string().uuid(),
  balance: z.number().int(),
  earned: z.number().int(),
  /** Harcanan — **negatif** taşınır (defterin işaretiyle aynı). */
  spent: z.number().int(),
  lastActivityAt: z.string(),
});
export type PointsBalance = z.infer<typeof PointsBalanceSchema>;

/**
 * `redeem_points` dönüşü. `ok:false` bir hata değil bir GERÇEKTİR: yetersiz bakiye ya da eşik altı
 * bir çevirme denemesi, sistemin çökmesi değil müşteriye söylenecek bir cümledir.
 */
export const RedemptionResultSchema = z.object({
  ok: z.boolean(),
  reason: z.enum(['insufficient_balance', 'below_minimum', 'not_eligible']).optional(),
  /** Oluşan kişisel kuponun kimliği ve kodu. */
  discountId: z.string().uuid().optional(),
  code: z.string().optional(),
  /** Kuponun değeri (cent) ve düşen puan. */
  valueCents: z.number().int().optional(),
  pointsSpent: z.number().int().optional(),
  balanceAfter: z.number().int().optional(),
});
export type RedemptionResult = z.infer<typeof RedemptionResultSchema>;
