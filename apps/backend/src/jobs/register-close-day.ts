import { serviceDb } from '@lezzet/database';
import { closeRegisterDay, hiboutikFromEnv, registerLiveFrom } from '@lezzet/application';
import { parisDateOf } from '@lezzet/helper';
import { captureError, logger, SOURCES } from '@lezzet/observability';

export const REGISTER_CLOSE_DAY = 'register_close_day';

const DEFAULT_CLOSE_AT = '23:50';

/** Gün sonunun saati (`HH:MM`, Paris); okunamayan değer varsayılana düşer ve bunu söyler, kapanış sessizce kaymasın. */
export function registerCloseCron(value = process.env.REGISTER_CLOSE_AT): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value ?? DEFAULT_CLOSE_AT);
  if (!match) logger.warn({ value }, `kasa gün sonu saati okunamadı, ${DEFAULT_CLOSE_AT} kullanılıyor`);
  const [, hour, minute] = match ?? /^(\d\d):(\d\d)$/.exec(DEFAULT_CLOSE_AT)!;
  return `${Number(minute)} ${Number(hour)} * * *`;
}

/**
 * Kasanın gün sonu: mağaza başına gün kapanışı ve mutabakat. Kapanış yalnız `HIBOUTIK_MODE=live` iken yapılır, çünkü mali kayıttır ve
 * geri alınmaz; mutabakat farkı hata kaydına uyarı olarak düşer ki sistem ekranında görünsün.
 */
export async function registerCloseDayJob(): Promise<Record<string, unknown>> {
  const register = hiboutikFromEnv();
  if (!register) return { skipped: 'not_configured' };
  const db = serviceDb();
  if (!(await registerLiveFrom(db))) return { skipped: 'not_live' };

  const result = await closeRegisterDay(db, register, { date: parisDateOf(new Date()), close: process.env.HIBOUTIK_MODE === 'live' });
  for (const store of result.stores.filter((candidate) => candidate.differences.length > 0)) {
    await captureError(new Error(`kasa mutabakatı: ${store.differences.length} fark`), {
      source: SOURCES.backendCron,
      level: 'warning',
      context: { job: REGISTER_CLOSE_DAY, warehouseId: store.warehouseId, date: result.date, differences: store.differences },
    });
  }
  return {
    date: result.date,
    waiting: result.waiting,
    stores: result.stores.map(({ warehouseId, closed, differences }) => ({ warehouseId, closed, differences: differences.length })),
  };
}
