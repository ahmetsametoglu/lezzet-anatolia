import { QUEUE_ALERT_AFTER_ATTEMPTS, QUEUE_BLOCKED_RETRY_MS, queueBackoffMs } from '@lezzet/domain-core';
import type { QueueRow } from '@lezzet/types';

/** Kuyruğun erteleme yazımı; kasa ve muhasebe kuyruğu ikisi de taşır. */
interface DeferringQueue {
  defer(row: Pick<QueueRow, 'id' | 'markedAt'>, change: { attempts: number; nextAttemptAt: string; lastError: string }): Promise<void>;
}

/** Duran satır seyrek yeniden denenir; haber yalnız sebep ilk görüldüğünde gider, aynı sebeple durdukça tekrar etmez. */
export async function deferBlocked(queue: DeferringQueue, row: QueueRow, reason: string, now: Date): Promise<{ firstTime: boolean }> {
  const lastError = `blocked:${reason}`;
  const nextAttemptAt = new Date(now.getTime() + QUEUE_BLOCKED_RETRY_MS).toISOString();
  await queue.defer(row, { attempts: row.attempts, nextAttemptAt, lastError });
  return { firstTime: row.lastError !== lastError };
}

/** Düşen satır artan aralıkla yeniden denenir; haber eşikteki düşüşte bir kez gider. */
export async function deferFailed(
  queue: DeferringQueue,
  row: QueueRow,
  message: string,
  now: Date,
): Promise<{ attempts: number; alert: boolean }> {
  const attempts = row.attempts + 1;
  const nextAttemptAt = new Date(now.getTime() + queueBackoffMs(attempts)).toISOString();
  await queue.defer(row, { attempts, nextAttemptAt, lastError: message });
  return { attempts, alert: attempts === QUEUE_ALERT_AFTER_ATTEMPTS };
}
