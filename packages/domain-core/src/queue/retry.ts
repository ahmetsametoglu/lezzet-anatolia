/**
 * Dış sisteme yazım kuyruğunun yeniden deneme kuralı; kasa ve muhasebe kuyruğu aynı eşikte haber verir. Düşen deneme bir dakikadan
 * başlayıp ikiye katlanır; muhasebe kuyruğu en çok bir saat, kasa kuyruğu en çok beş dakika bekler.
 */

export const QUEUE_ALERT_AFTER_ATTEMPTS = 5;

/** Duran satırın çözümü bir veri değişikliğiyle gelir ve satırı yeniden işaretler; ara deneme seyrek tutulur. */
export const QUEUE_BLOCKED_RETRY_MS = 6 * 3_600_000;

const MAX_BACKOFF_MS = 3_600_000;

/** Kasaya yazılmayı bekleyen satış yasal açıktır; bağlantı dönünce en geç bu sürede yazılmalı. */
export const REGISTER_BACKOFF_CAP_MS = 5 * 60_000;

/** `attempts`. düşüşten sonraki bekleme. */
export function queueBackoffMs(attempts: number, capMs: number = MAX_BACKOFF_MS): number {
  return Math.min(2 ** (attempts - 1) * 60_000, capMs);
}
