import type { HealthStatus, SystemHealthMetrics } from '@lezzet/types';

/**
 * Sistem sağlığı HÜKMÜ — ölçülen metriklerden `ok`/`warn`/`crit` (18.5, `OBSERVABILITY §2`).
 *
 * **Neden motorda:** bu bir karardır, ölçüm değil (STACK §4). Toplama işi `df`/`pm2`/`openssl`
 * okur — o I/O'dur ve testlenemez; "disk %84 uyarı mı" ise saf bir yüklemdir ve testlenir. İkisi tek
 * dosyada yaşasaydı eşikleri sınamak için sunucu taklidi kurmak gerekirdi.
 *
 * **Eşikler SABİT, ayar tablosunda değil.** Operatörün ayarlayacağı bir şey değil bunlar; ayar
 * tablosuna taşımak kimsenin dokunmayacağı bir ayarın bakım borcunu ve bir ayar ekranını doğurur.
 * Değişmesi gerekirse burada değişir ve testi vardır (`data-model/operasyon.md`).
 */

/** Sayılar tek yerde ve adlı: dallanmanın içine gömülü bir `90` neyi anlattığını söylemez. */
export const HEALTH_THRESHOLDS = {
  /** Disk dolulukları. Bu ölçekte sistemi durduran en olası tek şey diskin dolmasıdır. */
  diskCritPct: 90,
  diskWarnPct: 80,
  /**
   * KULLANILABİLİR bellek (MB) — "boş" değil. Linux boş belleği önbelleğe verir; boş bakan bir eşik
   * her sağlıklı sunucuyu kritik gösterirdi.
   */
  memCritAvailableMb: 200,
  memWarnAvailableMb: 500,
  /** Swap kullanım oranı: swap'a düşmüş sunucu "çalışıyor" ama yavaşlamıştır — ayrı bir haber. */
  swapWarnRatio: 0.5,
  /** Sertifika ömrü (gün). Sessizce dolan bir sertifika siteyi bir sabah kapatır. */
  certCritDays: 7,
  certWarnDays: 14,
  /** Son bir saatte hata sayısı — makine rahat ama uygulama bozuk olabilir. */
  errorsWarnPerHour: 10,
  /**
   * Ölçümün kendisi ne kadar bayat olursa arıza sayılır (dakika). Toplama iki dakikada bir koşuyor;
   * beş katı sessizlik "izleme durdu" demektir ve **izlemenin durduğu hâl, izlemenin en tehlikeli
   * hâlidir** — o yüzden bu `crit`.
   */
  staleCritMinutes: 10,
} as const;

/** Yükün ANLAMI çekirdek sayısına göredir: ham "2.4" bilgi değil, "2 çekirdekte 2.4" doygunluktur. */
export function loadCapacityPercent(loadAvg1: number, cpuCount: number): number {
  if (cpuCount <= 0) return 0;
  return Math.round((loadAvg1 / cpuCount) * 100);
}

/**
 * Hüküm. `crit` koşullarından BİRİ yeterse kritik; yoksa `warn` koşullarından biri yeterse uyarı.
 *
 * `crit` = servis ya da kaynak ARIZASI (bir şey çalışmıyor / çalışmak üzere); `warn` = baskı altında
 * ama ayakta. Ayrım ekranın renk kodudur ve karıştırılmamalı: her uyarıyı kritik saymak, gerçekten
 * kritik olanı görünmez yapar.
 *
 * `ageMinutes` verilirse bayatlık da hükme girer — çağıran onu görüntünün damgasından hesaplar.
 */
export function healthStatusOf(metrics: SystemHealthMetrics, ageMinutes?: number): HealthStatus {
  const t = HEALTH_THRESHOLDS;
  const { system: s, processes, services, app } = metrics;

  if (ageMinutes !== undefined && ageMinutes >= t.staleCritMinutes) return 'crit';

  const crit =
    // "online" olmayan süreç: web ya da backend fiilen çalışmıyor.
    processes.pm2.some((p) => p.status !== 'online') ||
    s.diskUsedPct >= t.diskCritPct ||
    s.memAvailableMb < t.memCritAvailableMb ||
    !services.webUp ||
    !services.caddyActive ||
    // `null` = ölçülemedi; bilinmemek bir arıza değil (ekran "bilinmiyor" der).
    (services.certDaysLeft !== null && services.certDaysLeft < t.certCritDays);
  if (crit) return 'crit';

  const swapRatio = s.swapTotalMb > 0 ? s.swapUsedMb / s.swapTotalMb : 0;
  const warn =
    s.diskUsedPct >= t.diskWarnPct ||
    s.memAvailableMb < t.memWarnAvailableMb ||
    swapRatio >= t.swapWarnRatio ||
    loadCapacityPercent(s.loadAvg[0], s.cpuCount) > 100 ||
    app.errorLogsLastHour > t.errorsWarnPerHour ||
    // Düşen cron: bir tur bile düştüyse haberdir — eşik yok, varlığı yeter.
    app.failedJobsLastHour > 0 ||
    (services.certDaysLeft !== null && services.certDaysLeft < t.certWarnDays);

  return warn ? 'warn' : 'ok';
}
