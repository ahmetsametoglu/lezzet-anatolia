import { z } from 'zod';

// Dış sağlayıcı olayları (07.5) — STACK §13 "Webhook güvenliği".
//
// Sağlayıcı aynı olayı birden çok kez gönderir; (provider, eventId) benzersizliği tek emniyettir.
// `processedAt` idempotensin KAYNAĞI değil, izidir.

export const WebhookEventSchema = z.object({
  id: z.string().uuid(),
  provider: z.string(),
  /** Sağlayıcının olay kimliği (`evt_...`) — tekrarı yakalayan alan. */
  eventId: z.string(),
  type: z.string(),
  payload: z.record(z.unknown()).nullable(),
  processedAt: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
});
export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

export const WebhookEventInsertSchema = z.object({
  provider: z.string().min(1),
  eventId: z.string().min(1),
  type: z.string().min(1),
  payload: z.record(z.unknown()).nullish(),
});
export type WebhookEventInsert = z.infer<typeof WebhookEventInsertSchema>;

export const WebhookEventUpdateSchema = WebhookEventSchema.partial().required({ id: true });
export type WebhookEventUpdate = z.infer<typeof WebhookEventUpdateSchema>;
