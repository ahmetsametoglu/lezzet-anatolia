import cron from 'node-cron';
import { serviceDb } from '@lezzet/database';
import { checkRegisterDay, hiboutikFromSecrets } from '@lezzet/application';
import { logger } from '@lezzet/observability';

/** İş saatlerinde iki saatte bir: her tur kasaya mağaza başına dört çağrı yapar ve kasanın aylık çağrı kotası satış yazımıyla ortaktır. */
const DEFAULT_CHECK_CRON = '40 8-20/2 * * *';

/** Gün içi karşılaştırmanın zamanı (cron ifadesi, Paris); okunamayan değer varsayılana düşer ve bunu söyler. */
export function registerCheckCron(value = process.env.REGISTER_CHECK_CRON): string {
  if (!value) return DEFAULT_CHECK_CRON;
  if (cron.validate(value)) return value;
  logger.warn({ value }, `kasa gün içi karşılaştırma zamanı okunamadı, ${DEFAULT_CHECK_CRON} kullanılıyor`);
  return DEFAULT_CHECK_CRON;
}

/** Bugünün kasa karşılaştırması; günü kapatmaz, fark gece kapanışından önce Pano'da görünür. */
export async function registerCheckDayJob(): Promise<Record<string, unknown>> {
  const db = serviceDb();
  const register = await hiboutikFromSecrets(db);
  if (!register) return { skipped: 'not_configured' };
  return checkRegisterDay(db, register, { now: new Date() });
}
