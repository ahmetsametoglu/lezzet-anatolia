import { serviceDb } from '@lezzet/database';
import { hiboutikFromSecrets, registerDayEnd } from '@lezzet/application';
import { logger } from '@lezzet/observability';

export const REGISTER_CLOSE_DAY = 'register_close_day';

/** Gece yarısından sonra: önceki gün bitmiş olmalı ki gece yarısına sarkan yazım da onun mutabakatına girsin. */
const DEFAULT_CLOSE_AT = '00:15';

/** Gün sonunun saati (`HH:MM`, Paris); okunamayan değer varsayılana düşer ve bunu söyler, kapanış sessizce kaymasın. */
export function registerCloseCron(value = process.env.REGISTER_CLOSE_AT): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value ?? DEFAULT_CLOSE_AT);
  if (!match) logger.warn({ value }, `kasa gün sonu saati okunamadı, ${DEFAULT_CLOSE_AT} kullanılıyor`);
  const [, hour, minute] = match ?? /^(\d\d):(\d\d)$/.exec(DEFAULT_CLOSE_AT)!;
  return `${Number(minute)} ${Number(hour)} * * *`;
}

/** Kasanın gün sonu; kapanış yalnız `HIBOUTIK_MODE=live` iken yapılır, çünkü mali kayıttır ve geri alınmaz. */
export async function registerCloseDayJob(): Promise<Record<string, unknown>> {
  const db = serviceDb();
  const register = await hiboutikFromSecrets(db);
  if (!register) return { skipped: 'not_configured' };
  return registerDayEnd(db, register, { now: new Date(), close: process.env.HIBOUTIK_MODE === 'live' });
}
