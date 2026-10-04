import { AnalyticsDailyService, serviceDb } from '@lezzet/database';
import { addDays, parisDateOf } from '@lezzet/helper';
import { logger } from '@lezzet/observability';

export const ANALYTICS_ROLLUP = 'analytics_rollup';

/**
 * Analitik özet ve bakım işi: bölüm bakımı, günlük özet, saklama süpürmesi, bu sırayla (`ANALYTICS §5`). Özet önce, silme sonra gelir,
 * çünkü ters sırada bir gün özet koşmazsa o günün verisi sessizce kaybolurdu.
 */

/** Ham olay saklama süresi (ay) — `ANALYTICS §5`: iki tam yılın aynı-ay karşılaştırma penceresi. */
const RETENTION_MONTHS = 25;

/** Yeniden üretilen gün sayısı; iş bir gün koşmazsa o gün özetsiz kalmasın, özet idempotent olduğu için bedeli bir upsert'tir. */
const REBUILD_DAYS = 3;

function isoMonth(offsetMonths: number): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + offsetMonths);
  return d.toISOString().slice(0, 10);
}

export async function analyticsRollupJob(): Promise<Record<string, unknown>> {
  const service = new AnalyticsDailyService(serviceDb());

  // 1) Bölüm bakımı — bu ay ve GELECEK ay. Gelecek ay şart: ay sonu gece yarısında bölüm yoksa
  //    ölçüm durur ve iş ancak ertesi gün koşar.
  await service.ensurePartition(isoMonth(0));
  await service.ensurePartition(isoMonth(1));

  // 2) Özet dünden geriye, Paris günüyle üretilir; bugün üretilmez, çünkü kapanmamış günün özeti eksiktir. Dört özet `buildAll` ile
  //    birlikte üretilir, ki yeni bir özet işe eklenmeyi unutmasın.
  const today = parisDateOf(new Date());
  let yazilan = 0;
  for (let i = 1; i <= REBUILD_DAYS; i += 1) {
    yazilan += await service.buildAll(addDays(today, -i));
  }

  // 3) Saklama — süresi dolan BÖLÜMLER düşer (satır silinmez).
  const dusen = await service.dropPartitionsBefore(isoMonth(-RETENTION_MONTHS));

  // 4) Bölüm düşürmenin YETMEDİĞİ iki tablo: oturum künyesi (bölümlenmemiş, psödonim anahtar) ve
  //    arama özeti (sistemdeki tek kalıcı serbest metin). İkisi de ham defterle aynı 25 ayı yaşar;
  //    yaşamasalardı "defteri sildik" cümlesi yarım kalırdı.
  const silinen = await service.purgeBefore(isoMonth(-RETENTION_MONTHS));

  // Ölçüm satırı: kaç özet satırı yazıldı, hangi bölümler düştü. Kimlik ya da içerik YOK.
  logger.info(
    { job: ANALYTICS_ROLLUP, summaryRows: yazilan, droppedPartitions: dusen.length, ...silinen },
    'analitik özet turu',
  );

  return { summaryRows: yazilan, droppedPartitions: dusen, ...silinen };
}
