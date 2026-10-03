import type { JobRun, QueueRow } from '@lezzet/types';
import { queueBlockReason } from '@/lib/queue/block-reason';

/** Bir backend turunun izi: ne zaman koştu, atladıysa neden, düştüyse hatası. */
export interface SetupJobView {
  at: string;
  skipped: string | null;
  error: string | null;
}

/**
 * Atlanan turda `skipped` sebep kodudur ve kartın diliyle gösterilir, tanınmayan kod olduğu gibi kalır. Normal turda aynı alan atlanan
 * satır sayısıdır ve gösterilmez.
 */
export function jobView(row: Pick<JobRun, 'lastRunAt' | 'lastResult' | 'lastError'>, skipLabels: Record<string, string>): SetupJobView {
  const skipped = row.lastResult?.['skipped'];
  return {
    at: row.lastRunAt,
    skipped: typeof skipped === 'string' ? (skipLabels[skipped] ?? skipped) : null,
    error: row.lastError,
  };
}

/** Kuyruğun özeti: bekleyen, dış sisteme ulaşamayıp yeniden denenen ve sebebiyle duran satırlar. */
export interface SetupQueueView {
  waiting: number;
  failing: number;
  blocked: Array<{ reason: string; count: number }>;
}

/** Duran satırlar sebebe göre toplanır, sebep kartın diliyle yazılır. */
export async function readQueueView(
  queue: { countWaiting(): Promise<number>; countFailing(): Promise<number>; listBlocked(): Promise<QueueRow[]> },
  label: (reason: string) => string,
): Promise<SetupQueueView> {
  const [waiting, failing, blocked] = await Promise.all([queue.countWaiting(), queue.countFailing(), queue.listBlocked()]);
  const reasons = new Map<string, number>();
  for (const row of blocked) {
    const reason = queueBlockReason(row.lastError);
    const text = reason ? label(reason) : '—';
    reasons.set(text, (reasons.get(text) ?? 0) + 1);
  }
  return { waiting, failing, blocked: [...reasons].map(([reason, count]) => ({ reason, count })) };
}
