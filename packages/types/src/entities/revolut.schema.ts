import { z } from 'zod';

/**
 * Revolut Merchant API cevaplarının bize yeten yüzü (`docs/feature/kasa-muhasebe.md` §6). Alan adları sağlayıcının yazımıyla durur ve
 * uyarlama bizim dilimize çevirir; tutarlar cent, para birimi büyük harf ISO kodu.
 */

export const RevolutModeEnum = z.enum(['sandbox', 'live']);
export type RevolutMode = z.infer<typeof RevolutModeEnum>;

/** Siparişin durumu; sağlayıcıdan bağımsız ödeme durumunun (`ProviderPaymentStatus`) kaynağı. */
export const RevolutOrderStateEnum = z.enum(['pending', 'processing', 'authorised', 'completed', 'cancelled', 'failed']);
export type RevolutOrderState = z.infer<typeof RevolutOrderStateEnum>;

export const RevolutApiFeeSchema = z.object({
  type: z.string(),
  amount: z.number().int(),
  currency: z.string(),
});
export type RevolutApiFee = z.infer<typeof RevolutApiFeeSchema>;

export const RevolutApiPaymentSchema = z.object({
  id: z.string(),
  state: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  settled_amount: z.number().int().optional(),
  settled_currency: z.string().optional(),
  /** Tahsilden hemen sonra dolar; iade ödemesinde boş dizi. */
  fees: z.array(RevolutApiFeeSchema).optional(),
  decline_reason: z.string().optional(),
});
export type RevolutApiPayment = z.infer<typeof RevolutApiPaymentSchema>;

export const RevolutApiOrderSchema = z.object({
  id: z.string(),
  /** Ödeme formunu açan genel kimlik; gizli değildir, sipariş kimliği istemciye verilmez. */
  token: z.string().optional(),
  type: z.string(),
  state: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  outstanding_amount: z.number().int().optional(),
  refunded_amount: z.number().int().optional(),
  created_at: z.string(),
  updated_at: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  merchant_order_data: z.object({ reference: z.string().optional() }).optional(),
  /** İade siparişinin iade ettiği sipariş. */
  related_order_id: z.string().optional(),
  payments: z.array(RevolutApiPaymentSchema).optional(),
});
export type RevolutApiOrder = z.infer<typeof RevolutApiOrderSchema>;

export const RevolutApiPayoutSchema = z.object({
  id: z.string(),
  state: z.string(),
  created_at: z.string(),
  /** İşlenirken boştur: tutar aktarım sırasında hesaplanır. */
  amount: z.number().int().optional(),
  currency: z.string().optional(),
});
export type RevolutApiPayout = z.infer<typeof RevolutApiPayoutSchema>;

/** Webhook gövdesi: olay ve kimlik; ayrıntı siparişi ya da aktarımı okuyarak alınır. */
export const RevolutWebhookEventSchema = z.object({
  event: z.string(),
  order_id: z.string().optional(),
  merchant_order_ext_ref: z.string().optional(),
  payout_id: z.string().optional(),
  dispute_id: z.string().optional(),
});
export type RevolutWebhookEvent = z.infer<typeof RevolutWebhookEventSchema>;
