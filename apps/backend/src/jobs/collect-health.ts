import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import { promisify } from 'node:util';
import { ErrorLogService, JobRunService, SystemHealthService, serviceDb } from '@lezzet/database';
import { healthStatusOf } from '@lezzet/domain-core';
import { logger } from '@lezzet/observability';
import type { SystemHealthMetrics } from '@lezzet/types';

export const COLLECT_HEALTH = 'collect_health';

/**
 * Sistem sağlığı toplama (18.5) — `OBSERVABILITY §2`, ekran `design/pages/admin-sistem.md`.
 *
 * Sunucu + süreç + servis + uygulama metriklerini toplar, hükmü MOTORA sorar (`healthStatusOf` —
 * eşikler orada, testli) ve tek satır yazar. Bu dosya **yalnız ölçer**; "disk %84 uyarı mı" kararı
 * burada verilmez (STACK §4).
 *
 * **HER METRİK DEFANSİF.** Bir kaynak (`df`, `pm2`, `openssl`) patlarsa o alan güvenli varsayılana
 * düşer ve iş devam eder — izlemenin kendisi bir arıza kaynağı olamaz. "İzleme çöktü" demek "izleme
 * yok" demektir; yarım bir görüntü, hiç görüntü olmamasından iyidir.
 *
 * Yerelde (macOS) `/proc` yok, `pm2`/`systemctl` yok: alanlar yedeklerine düşer ve iş yine koşar.
 * Ölçümün gerçek yeri sunucudur; yerelde amaç akışın çalıştığını görmek.
 */
const exec = promisify(execFile);

const WEB_URL = `http://127.0.0.1:${process.env.WEB_HEALTH_PORT ?? 3000}/`;
/** Ölçülemeyen diskin tek gösterimi — üç alan birlikte bilinmez olur, yarısı sayı yarısı boş kalmaz. */
const UNMEASURED_DISK = { diskTotalGb: null, diskUsedGb: null, diskUsedPct: null } as const;
const HOUR_MS = 60 * 60 * 1000;
const MB = 1024 * 1024;

/**
 * `/proc/meminfo` — Linux'ta tek doğru kaynak. **`MemAvailable` okunur, `MemFree` DEĞİL:** Linux boş
 * belleği önbelleğe verir, dolayısıyla sağlıklı bir sunucuda `MemFree` her zaman düşüktür ve ona
 * bakan bir eşik sürekli alarm çalar. `MemAvailable`, çekirdeğin "istersen veririm" dediği miktardır.
 */
async function readMemory(): Promise<Pick<SystemHealthMetrics['system'], 'memTotalMb' | 'memAvailableMb' | 'swapTotalMb' | 'swapUsedMb'>> {
  try {
    const text = await readFile('/proc/meminfo', 'utf8');
    const kb = (key: string): number => Number(new RegExp(`^${key}:\\s+(\\d+)\\s+kB`, 'm').exec(text)?.[1] ?? 0);
    const toMb = (value: number) => Math.round(value / 1024);
    const swapTotal = kb('SwapTotal');
    return {
      memTotalMb: toMb(kb('MemTotal')),
      memAvailableMb: toMb(kb('MemAvailable')),
      swapTotalMb: toMb(swapTotal),
      swapUsedMb: toMb(swapTotal - kb('SwapFree')),
    };
  } catch {
    // Linux değil: `os.freemem()` yaklaşık bir "kullanılabilir"dir; swap bilinmez (0 = "yok", eşik
    // oranı da 0 çıkar → uyarı doğurmaz; bilinmeyen bir değerin uyarı üretmesi yanlış olurdu).
    return {
      memTotalMb: Math.round(os.totalmem() / MB),
      memAvailableMb: Math.round(os.freemem() / MB),
      swapTotalMb: 0,
      swapUsedMb: 0,
    };
  }
}

/** Kök birimin doluluğu. `df -P` taşınabilir çıktı biçimi verir (POSIX), `-k` birimi sabitler. */
async function readDisk(): Promise<Pick<SystemHealthMetrics['system'], 'diskTotalGb' | 'diskUsedGb' | 'diskUsedPct'>> {
  try {
    const { stdout } = await exec('df', ['-P', '-k', '/']);
    const parts = (stdout.trim().split('\n').pop() ?? '').split(/\s+/);
    const toGb = (kb: string | undefined) => Math.round((Number(kb ?? 0) / 1024 / 1024) * 10) / 10;
    const pct = Number((parts[4] ?? '').replace('%', ''));
    // Yüzde ayrıştırılamadıysa da ÖLÇÜM YOKTUR: `|| 0` yazmak "disk boş" demek olurdu.
    if (!Number.isFinite(pct)) return UNMEASURED_DISK;
    return { diskTotalGb: toGb(parts[1]), diskUsedGb: toGb(parts[2]), diskUsedPct: pct };
  } catch (error) {
    // **SIFIR DÖNMEZ, `null` DÖNER.** Sıfır "disk boş" diye okunur, eşiklerden `ok` çıkar ve bozuk
    // bir ölçüm sağlıklı bir disk gibi görünür — ilk yazımdaki hata buydu (30.07 denetimi).
    logger.warn({ context: 'health/disk', err: error instanceof Error ? error.message : String(error) }, 'disk ölçülemedi');
    return UNMEASURED_DISK;
  }
}

/**
 * PM2 süreçleri. **Okunamazsa `null`, boş dizi DEĞİL:** boş dizi "hiçbir süreç düşmemiş" diye
 * okunur ve hüküm `ok` çıkar. Motor `null`'ı arıza saymaz ama sessiz de geçmez — ölçüm boşluğu
 * uyarı üretir (`healthStatusOf`).
 */
async function readProcesses(): Promise<SystemHealthMetrics['processes']> {
  try {
    const { stdout } = await exec('pm2', ['jlist'], { maxBuffer: 4 * MB });
    const list = JSON.parse(stdout) as Array<{
      name?: string;
      pm2_env?: { status?: string; restart_time?: number };
      monit?: { memory?: number; cpu?: number };
    }>;
    return {
      pm2: list.map((p) => ({
        name: p.name ?? '?',
        status: p.pm2_env?.status ?? 'unknown',
        restarts: p.pm2_env?.restart_time ?? 0,
        memoryMb: Math.round((p.monit?.memory ?? 0) / MB),
        cpuPct: p.monit?.cpu ?? 0,
      })),
    };
  } catch (error) {
    logger.warn({ context: 'health/pm2', err: error instanceof Error ? error.message : String(error) }, 'süreç listesi okunamadı');
    return { pm2: null };
  }
}

/** Web ayakta mı — İÇERİDEN denetlenir: dışarıdan bakmak Caddy'yi de sınardı, o ayrı bir soru. */
async function webUp(): Promise<boolean> {
  try {
    const res = await fetch(WEB_URL, { signal: AbortSignal.timeout(3000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

/** Ters vekil etkin mi. `is-active` inaktifte sıfırdan farklı çıkışla döner → catch de "hayır"dır. */
async function caddyActive(): Promise<boolean> {
  try {
    const { stdout } = await exec('systemctl', ['is-active', 'caddy']);
    return stdout.trim() === 'active';
  } catch {
    return false;
  }
}

/**
 * Sertifikanın kalan ömrü. `null` = ÖLÇÜLEMEDİ ve bu sıfırdan farklı bir şeydir: sıfır "bugün doluyor"
 * demek, `null` "bilmiyorum" demek. Motor `null`'ı uyarı saymaz, ekran "bilinmiyor" yazar.
 */
async function certDaysLeft(): Promise<number | null> {
  const host = process.env.SITE_HOST;
  if (!host) return null; // Alan adı bilinmiyorsa ölçüm yok — localhost'un sertifikası soruyu yanıtlamaz.
  try {
    const { stdout } = await exec('bash', [
      '-c',
      `echo | openssl s_client -connect ${host}:443 -servername ${host} 2>/dev/null | openssl x509 -noout -enddate`,
    ]);
    const raw = /notAfter=(.+)/.exec(stdout)?.[1]?.trim();
    const endsAt = raw ? Date.parse(raw) : Number.NaN;
    return Number.isNaN(endsAt) ? null : Math.floor((endsAt - Date.now()) / (24 * HOUR_MS));
  } catch {
    return null;
  }
}

/**
 * Uygulama düzeyi: makine rahat ama uygulama bozuk olabilir — ayrı bir soru, ayrı iki sayı.
 *
 * Düşen cron `job_run`'dan okunur: son turu hatalı ve son bir saat içinde koşmuş işler. Tarihçe
 * tutulmadığı için bu "son bir saatte kaç tur düştü" değil, "şu an hatalı duran kaç iş var" — sayı
 * küçük ama sorunun cevabı aynı: bir şey düşmüş mü.
 */
async function readAppMetrics(): Promise<SystemHealthMetrics['app']> {
  const db = serviceDb();
  const since = new Date(Date.now() - HOUR_MS).toISOString();
  const safe = async (label: string, read: () => Promise<number>): Promise<number> => {
    try {
      return await read();
    } catch (error) {
      // Sıfır dönmek "hiç hata yok" diye okunur — disk/pm2 ile aynı fail-open tuzağı. Alan
      // şemada sayı olduğu için `null` veremiyoruz (ekran bu iki sayıyı her zaman gösteriyor);
      // en azından ölçümün DÜŞTÜĞÜ görünür olsun. Pratikte nadirdir: bu okumalar düşüyorsa
      // görüntünün kendisi de yazılamaz.
      logger.warn({ context: 'health/app', metric: label, err: error instanceof Error ? error.message : String(error) }, 'uygulama metriği okunamadı');
      return 0;
    }
  };

  const [errorLogsLastHour, failedJobsLastHour] = await Promise.all([
    safe('errorLogsLastHour', () => new ErrorLogService(db).countSince(since)),
    safe('failedJobsLastHour', () => new JobRunService(db).countFailedSince(since)),
  ]);
  return { errorLogsLastHour, failedJobsLastHour };
}

export async function collectHealthJob(): Promise<Record<string, unknown>> {
  const [memory, disk, processes, up, caddy, cert, app] = await Promise.all([
    readMemory(),
    readDisk(),
    readProcesses(),
    webUp(),
    caddyActive(),
    certDaysLeft(),
    readAppMetrics(),
  ]);
  const load = os.loadavg();

  const metrics: SystemHealthMetrics = {
    system: {
      loadAvg: [load[0] ?? 0, load[1] ?? 0, load[2] ?? 0],
      cpuCount: os.cpus().length,
      ...memory,
      memUsedMb: Math.max(0, memory.memTotalMb - memory.memAvailableMb),
      ...disk,
      uptimeSec: Math.round(os.uptime()),
    },
    processes,
    services: { webUp: up, caddyActive: caddy, certDaysLeft: cert },
    app,
  };

  // Hüküm MOTORDAN. Bayatlık burada geçilmez: görüntü bu an yazılıyor, yaşı sıfır — bayatlığı
  // OKUYAN taraf hesaplar (son satırın damgasına bakarak), yazan taraf değil.
  const status = healthStatusOf(metrics);
  await new SystemHealthService(serviceDb()).record(status, metrics);

  if (status !== 'ok') {
    logger.warn(
      { status, diskUsedPct: metrics.system.diskUsedPct, memAvailableMb: metrics.system.memAvailableMb },
      'sistem sağlığı ok değil',
    );
  }
  return { status };
}
