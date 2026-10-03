/**
 * Dış sisteme yazım kuyruğunun yeniden deneme kuralı; kasa ve muhasebe kuyruğu aynı aralıkla dener ve aynı eşikte haber verir.
 * Düşen deneme bir dakikadan başlayıp ikiye katlanır, en çok bir saat bekler; beşinci düşüş yaklaşık on beş dakikaya denk gelir.
 */

export const QUEUE_ALERT_AFTER_ATTEMPTS = 5;

/** Duran satırın çözümü bir veri değişikliğiyle gelir ve satırı yeniden işaretler; ara deneme seyrek tutulur. */
export const QUEUE_BLOCKED_RETRY_MS = 6 * 3_600_000;

const MAX_BACKOFF_MS = 3_600_000;

/** `attempts`. düşüşten sonraki bekleme. */
export function queueBackoffMs(attempts: number): number {
  return Math.min(2 ** (attempts - 1) * 60_000, MAX_BACKOFF_MS);
}
