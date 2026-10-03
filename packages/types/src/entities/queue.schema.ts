import { z } from 'zod';

/**
 * Dış sisteme yazım kuyruğunun ortak satırı; kasa ve muhasebe kuyruğu hedef kolonları dışında aynıdır. `lastError` duran satırda
 * `blocked:<sebep>`, düşen satırda hatanın metnidir.
 */
export const QueueRowSchema = z.object({
  id: z.string().uuid(),
  markedAt: z.string(),
  attempts: z.number().int(),
  nextAttemptAt: z.string(),
  lastError: z.string().nullable(),
});
export type QueueRow = z.infer<typeof QueueRowSchema>;

export const QueueRowUpdateSchema = QueueRowSchema.pick({ id: true, attempts: true, nextAttemptAt: true, lastError: true })
  .partial()
  .required({ id: true });
export type QueueRowUpdate = z.infer<typeof QueueRowUpdateSchema>;
