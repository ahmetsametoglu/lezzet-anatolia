import { AnalyticsDailyService, serviceDb } from '@lezzet/database';
import { logger } from '@lezzet/observability';

export const ANALYTICS_ROLLUP = 'analytics_rollup';

/**
 * **Analitik özet + bakım işi** (13.1 · `ANALYTICS §5`).
 *
 * Üç iş, ve SIRALARI kritik:
 *   1. **Bölüm bakımı** — gelecek ayın bölümü açılır.
 *   2. **Günlük özet** — dün (ve emniyet payı olarak evvelsi gün) üretilir.
 *   3. **Saklama süpürmesi** — 25 ayı dolduran BÖLÜMLER düşürülür.
 *
 * **Özet ÖNCE, silme SONRA** (`ANALYTICS §5`). Ters sırada bir gün özet koşmazsa o günün verisi hem
 * özette hem ham defterde yok olur ve bunu kimse fark etmez — kayıp sessizdir.
 *
 * **Bölüm bakımı neden bir İŞİN parçası, elle yapılan bakım değil:** bölüm yoksa `insert` hata verir
 * ve o hata ayın ilk gününde, gece yarısı, ölçümün en sessiz yerinde patlar. Kapı ölçümün akışı
 * kesmemesi için hatayı yutuyor — yani ay başında ölçüm sessizce durur. Bu işin var olma sebebi
 * budur.
 */

/** Ham olay saklama süresi (ay) — `ANALYTICS §5`: iki tam yılın aynı-ay karşılaştırma penceresi. */
const RETENTION_MONTHS = 25;

/**
 * Kaç günü yeniden üretiyoruz. Bir gün YETMEZ: iş bir gün koşmazsa o gün özetsiz kalırdı ve
 * özet idempotent olduğu için ikinci kez üretmenin maliyeti yalnız bir upsert'tir. Ucuz bir
 * emniyet payı, sessiz bir boşluktan iyidir.
 */
const REBUILD_DAYS = 3;

function isoDay(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

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

  // 2) Özet — dünden geriye doğru. BUGÜN üretilmiyor: gün kapanmadan üretilen özet eksiktir ve
  //    ertesi koşuda zaten üzerine yazılacaktı; eksik bir sayıyı ekrana bir gün boyunca göstermek,
  //    hiç göstermemekten kötüdür.
  //
  //    **DÖRT özet birlikte üretilir** (`buildAll`): gün özeti + ürün + arama + kaynak. Ayrı
  //    çağrılar bırakılsaydı yeni bir özet eklendiği gün işe eklenmeyi unutmak mümkün olurdu ve
  //    unutulduğunda hata vermezdi — yalnız o blok hiç dolmazdı.
  let yazilan = 0;
  for (let i = 1; i <= REBUILD_DAYS; i += 1) {
    yazilan += await service.buildAll(isoDay(-i));
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
