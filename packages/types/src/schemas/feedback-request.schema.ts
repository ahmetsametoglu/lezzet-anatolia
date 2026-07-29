import { z } from 'zod';
import { FeedbackChannelEnum } from './enums.schema';

// FeedbackRequest — alım-sonrası geri bildirim daveti (17.2, migration 0038). DOMAIN §14.
//
// Teslimden ~10 gün sonra giden kişisel bağlantı. **Token oturum yerine geçer**: davet telefonda
// tek elle açılır, araya giriş ekranı koymak akışı kırar ve tamamlanma oranını düşürür.

export const FeedbackRequestSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  customerId: z.string().uuid(),
  /** Bağlantının anahtarı — **rastgele**, sıralı değil (`reference_no` ile aynı gerekçe). */
  token: z.string(),
  channel: FeedbackChannelEnum,
  sentAt: z.string().nullable(),
  /** Akışın SONLANDIĞI an. İlerleme türetilir ama bu damga saklanır — puanın tek kez verilmesini o sağlar. */
  completedAt: z.string().nullable(),
  pointsAwarded: z.number().int().nullable(),
  createdAt: z.string(),
});
export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;

export const FeedbackRequestInsertSchema = z.object({
  orderId: z.string().uuid(),
  customerId: z.string().uuid(),
  token: z.string().min(8),
  channel: FeedbackChannelEnum,
  sentAt: z.string().nullish(),
});
export type FeedbackRequestInsert = z.infer<typeof FeedbackRequestInsertSchema>;

export const FeedbackRequestUpdateSchema = FeedbackRequestSchema.partial().required({ id: true });
export type FeedbackRequestUpdate = z.infer<typeof FeedbackRequestUpdateSchema>;

/**
 * `feedback_request_progress` görünümü — "2/5" ilerlemesi.
 *
 * Sayaç SAKLANMAZ: siparişin ürünleri ile o davetten doğan değerlendirmelerden türetilir. Bir sayaç
 * tutulsaydı, yarıda bırakılıp geri dönülen akışta bir gün gerçekle ayrışır ve müşteri "ben bunu
 * değerlendirmiştim" derdi.
 */
export const FeedbackRequestProgressSchema = z.object({
  feedbackRequestId: z.string().uuid(),
  orderId: z.string().uuid(),
  customerId: z.string().uuid(),
  completedAt: z.string().nullable(),
  totalProducts: z.number().int(),
  ratedProducts: z.number().int(),
});
export type FeedbackRequestProgress = z.infer<typeof FeedbackRequestProgressSchema>;
