import { JobRunService, serviceDb } from '@lezzet/database';
import { watchDistanceSaleThreshold } from '@lezzet/application/accounting/distance-sale-watch';

export const DISTANCE_SALE_THRESHOLD = 'distance_sale_threshold';

/** Uzaktan satış eşiğinin günlük turu; önceki turun sonucu "vergilendirme değişti mi" sorusunun ölçütüdür. */
export async function distanceSaleThresholdJob(): Promise<Record<string, unknown>> {
  const db = serviceDb();
  const previous = await new JobRunService(db).findByName(DISTANCE_SALE_THRESHOLD);
  return watchDistanceSaleThreshold(db, { previous: previous?.lastResult ?? null });
}
