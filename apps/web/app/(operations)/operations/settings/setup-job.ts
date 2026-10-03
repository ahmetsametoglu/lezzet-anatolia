import type { JobRun } from '@lezzet/types';

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
