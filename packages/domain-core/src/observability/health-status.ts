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
 *
 * **Hüküm SİNYALLERDEN türer, ayrı bir dallanmadan değil** (`healthSignals` → `healthStatusOf`).
 * Sebebi ekranın yükümlülüğü: e-posta alarmı bilinçli olarak yokken (`OBSERVABILITY §4.1`) ekran
 * "neden kritik" sorusunu yanıtlamak zorunda ve renk tek başına bilgi değildir. İki ayrı liste
 * yazılsaydı — biri hüküm için, biri gerekçe için — bir gün ayrışırlardı: motor kritik der, ekran
 * sebebi gösteremezdi. Tek liste, iki tüketici.
 */

/**
 * Toplama sıklığı (dakika) — **cron bunu kurar, ekran geri sayımını bundan çizer.**
 *
 * İki tüketicisi olduğu için motorda: cron ifadesini backend'de yazıp ekranda "sonraki ölçüm" için
 * ayrıca 2 yazmak, bir gün sıklık değişince ekranın yalan söylemesi demekti. Sıklık çözünürlüğü de
 * belirliyor: daha sık toplamak 14 günlük saklamayı katlar, daha seyrek toplamak "disk ne zaman
 * doldu" sorusunu bulanıklaştırır.
 */
export const HEALTH_COLLECT_INTERVAL_MIN = 2;

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
  /**
   * Kaç yeniden başlamadan sonra bu bir HABER olur. Hükmü DEĞİŞTİRMEZ (`info`): süreç şu an ayakta
   * ve eşik uydurmak, üretimdeki her dağıtımı uyarıya çevirirdi. Ama sessiz arızanın en iyi
   * göstergesi budur — süreç "online" görünürken gece boyu kırk kez düşüp kalkmış olabilir.
   */
  restartsNoticeCount: 3,
  /** Bu süreden yeni bir çalışma süresi beklenmeyen bir yeniden başlatmadır — not, hüküm değil. */
  rebootNoticeSec: 3600,
} as const;

/** Yükün ANLAMI çekirdek sayısına göredir: ham "2.4" bilgi değil, "2 çekirdekte 2.4" doygunluktur. */
export function loadCapacityPercent(loadAvg1: number, cpuCount: number): number {
  if (cpuCount <= 0) return 0;
  return Math.round((loadAvg1 / cpuCount) * 100);
}

/**
 * Tutan koşulun kimliği. Ekran bunu Türkçe cümleye çevirir — **metin burada YOK**: motor karar
 * verir, dil arayüzün işidir (aynı sinyal ileride bir bildirimde başka sözcüklerle görünebilir).
 */
export type HealthSignalCode =
  | 'stale'
  | 'web-down'
  | 'caddy-down'
  | 'caddy-unknown'
  | 'disk-crit'
  | 'disk-warn'
  | 'disk-unknown'
  | 'mem-crit'
  | 'mem-warn'
  | 'swap'
  | 'process-down'
  | 'process-unknown'
  | 'process-restarts'
  | 'load'
  | 'errors'
  | 'failed-jobs'
  | 'cert-crit'
  | 'cert-warn'
  | 'cert-unknown'
  | 'reboot';

/**
 * Sinyalin ağırlığı. `info` HÜKME GİRMEZ: söylenmeye değer ama bir şeyin bozuk olduğunu söylemeyen
 * gözlemler (taze yeniden başlatma, okunamayan sertifika) buraya düşer. Onları uyarıya çevirmek,
 * uyarının değerini düşürürdü — sürekli uyaran bir panel, gerçekten uyardığında okunmaz.
 */
export type HealthSignalLevel = 'crit' | 'warn' | 'info';

export interface HealthSignal {
  code: HealthSignalCode;
  level: HealthSignalLevel;
}

/**
 * Tutan bütün koşullar, ekranın okuyacağı sırayla: önce izlemenin kendisi, sonra dışarıdan
 * erişilebilirlik, sonra kaynaklar, en sonda notlar. Sıra bilinçli — hüküm şeridinin ilk satırı
 * en çok şey söyleyen satır olmalı.
 *
 * `ageMinutes` verilirse bayatlık da listeye girer; çağıran onu görüntünün damgasından hesaplar.
 */
export function healthSignals(metrics: SystemHealthMetrics, ageMinutes?: number): HealthSignal[] {
  const t = HEALTH_THRESHOLDS;
  const { system: s, processes, services, app } = metrics;
  const out: HealthSignal[] = [];
  const add = (code: HealthSignalCode, level: HealthSignalLevel) => out.push({ code, level });

  // İzleme durduysa aşağıdaki her değer geçmişe aittir; bu yüzden ilk satır.
  if (ageMinutes !== undefined && ageMinutes >= t.staleCritMinutes) add('stale', 'crit');

  // Dışarıdan erişilebilirlik: süreçler ne görünürse görünsün, ters vekil düşükse site kapalıdır.
  if (!services.webUp) add('web-down', 'crit');
  // `false` = systemd "etkin değil" DEDİ · `null` = SORAMADIK. İkisi aynı değere düşerse ölçüm
  // boşluğu arıza gibi okunur — disk ve pm2 için 30.07'de düzeltilen hatanın Caddy'de kalmış hâliydi.
  if (services.caddyActive === false) add('caddy-down', 'crit');
  else if (services.caddyActive === null) add('caddy-unknown', 'warn');

  // Disk: `null` = ölçülemedi. Sıfır sayılsaydı eşiklerden `ok` çıkardı — bozuk ölçüm, sağlıklı disk.
  if (s.diskUsedPct === null) add('disk-unknown', 'warn');
  else if (s.diskUsedPct >= t.diskCritPct) add('disk-crit', 'crit');
  else if (s.diskUsedPct >= t.diskWarnPct) add('disk-warn', 'warn');

  if (s.memAvailableMb < t.memCritAvailableMb) add('mem-crit', 'crit');
  else if (s.memAvailableMb < t.memWarnAvailableMb) add('mem-warn', 'warn');

  const swapRatio = s.swapTotalMb > 0 ? s.swapUsedMb / s.swapTotalMb : 0;
  if (swapRatio >= t.swapWarnRatio) add('swap', 'warn');

  if (processes.pm2 === null) add('process-unknown', 'warn');
  else if (processes.pm2.some((p) => p.status !== 'online')) add('process-down', 'crit');
  else if (processes.pm2.some((p) => p.restarts >= t.restartsNoticeCount)) add('process-restarts', 'info');

  if (loadCapacityPercent(s.loadAvg[0], s.cpuCount) > 100) add('load', 'warn');

  if (app.errorLogsLastHour > t.errorsWarnPerHour) add('errors', 'warn');
  // Düşen cron: bir tur bile düştüyse haberdir — eşik yok, varlığı yeter.
  if (app.failedJobsLastHour > 0) add('failed-jobs', 'warn');

  if (services.certDaysLeft === null) add('cert-unknown', 'info');
  else if (services.certDaysLeft < t.certCritDays) add('cert-crit', 'crit');
  else if (services.certDaysLeft < t.certWarnDays) add('cert-warn', 'warn');

  if (s.uptimeSec < t.rebootNoticeSec) add('reboot', 'info');

  return out;
}

/**
 * Hüküm. `crit` sinyallerinden BİRİ yeterse kritik; yoksa `warn` sinyallerinden biri yeterse uyarı.
 *
 * `crit` = servis ya da kaynak ARIZASI (bir şey çalışmıyor / çalışmak üzere); `warn` = baskı altında
 * ama ayakta. Ayrım ekranın renk kodudur ve karıştırılmamalı: her uyarıyı kritik saymak, gerçekten
 * kritik olanı görünmez yapar.
 */
export function healthStatusOf(metrics: SystemHealthMetrics, ageMinutes?: number): HealthStatus {
  const signals = healthSignals(metrics, ageMinutes);
  if (signals.some((x) => x.level === 'crit')) return 'crit';
  return signals.some((x) => x.level === 'warn') ? 'warn' : 'ok';
}
