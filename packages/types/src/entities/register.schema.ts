import { z } from 'zod';
import { dbNumeric } from '../primitives/db-numeric';
import { PaymentMethodEnum } from '../primitives/enums.schema';

// Kasa aynası: sertifikalı kasaya (Hiboutik) ne yazıldığının bizdeki kaydı. Sonraki yazımın farkı buna göre çıkar.

/** Fiş kaleminin kaynağı: sipariş kalemi ya da kargo ücretinin bir KDV oranına düşen payı. */
export const RegisterLineKindEnum = z.enum(['item', 'shipping']);
export type RegisterLineKind = z.infer<typeof RegisterLineKindEnum>;

export const RegisterLineSchema = z.object({
  kind: RegisterLineKindEnum,
  /** Sipariş kaleminde dolu, kargoda `null`. */
  orderItemId: z.string().uuid().nullable(),
  /** İşaretli: iade fişinde eksi. */
  qty: z.number().int(),
  /** **Cent**, işaretli, kanalın tabanında (B2C'de KDV dahil). */
  amountCents: z.number().int(),
  vatRate: dbNumeric,
});
export type RegisterLine = z.infer<typeof RegisterLineSchema>;

export const RegisterPaymentSchema = z.object({
  method: PaymentMethodEnum,
  /** **Cent**, işaretli: tahsilat artı, iade eksi. */
  amountCents: z.number().int(),
  /** Satırı doğuran para hareketi; silinmiş hareketin ters satırında `null`. */
  movementId: z.string().uuid().nullable(),
  /** Ters satırın geri aldığı hareket; aynı hareket ikinci kez ters çevrilmesin diye tutulur. */
  reversalOf: z.string().uuid().nullable(),
});
export type RegisterPayment = z.infer<typeof RegisterPaymentSchema>;

/** Siparişin kasadaki bir fişi, kalemleri ve ödeme satırlarıyla. */
export const RegisterTicketSnapshotSchema = z.object({
  seq: z.number().int().positive(),
  lines: z.array(RegisterLineSchema),
  payments: z.array(RegisterPaymentSchema),
});
export type RegisterTicketSnapshot = z.infer<typeof RegisterTicketSnapshotSchema>;
