import { z } from 'zod';
import { TrustReasonEnum } from '../primitives/enums.schema';

// Güven defteri — tavsiye niteliğindeki müşteri puanı; puan Σ `points`tır ve saklanmaz. Müşteriye görünmez, hiçbir şeyi engellemez.

export const TrustEntrySchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  /** Yazım anındaki ağırlık: + ödül, − ceza. */
  points: z.number().int(),
  reason: TrustReasonEnum,
  /** Olayı doğuran kayıt (sipariş, durum kaydı, puan satırı) — bir iz, bağ değil. */
  refId: z.string().uuid(),
  occurredAt: z.string(),
  createdAt: z.string(),
});
export type TrustEntry = z.infer<typeof TrustEntrySchema>;

export const TrustEntryInsertSchema = TrustEntrySchema.omit({ id: true, createdAt: true }).extend({
  points: z.number().int().refine((v) => v !== 0, { message: 'Güven hareketi sıfır olamaz' }),
});
export type TrustEntryInsert = z.infer<typeof TrustEntryInsertSchema>;

/** `trust_fact` görünümü — deftere henüz yazılmamış olay. */
export const TrustFactSchema = z.object({
  reason: TrustReasonEnum,
  customerId: z.string().uuid(),
  refId: z.string().uuid(),
  occurredAt: z.string(),
});
export type TrustFact = z.infer<typeof TrustFactSchema>;

/** `customer_trust_score` görünümü — defterden türeyen puan. */
export const CustomerTrustScoreSchema = z.object({
  customerId: z.string().uuid(),
  score: z.number().int(),
  entryCount: z.number().int(),
});
export type CustomerTrustScore = z.infer<typeof CustomerTrustScoreSchema>;
