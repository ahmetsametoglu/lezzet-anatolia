import { afterAll, describe, expect, it } from 'vitest';
import { SystemHealthService } from './system-health.service';
import { serviceDb } from '../client';
import type { SystemHealthMetrics } from '@lezzet/types';

/**
 * Sistem sağlığı görüntüleri (18.5). Sınanan şey ekranın dayandığı üç okuma: **son görüntü** (kart),
 * **pencere** (trend) ve **saklama süpürmesi**.
 *
 * `metrics` tek `jsonb`; testin ikinci işi o dönüşümün sağlam olduğunu göstermek — kolon açmadığımız
 * için tip güvencesi yalnız Zod'da ve gidiş-dönüşün bozulması sessiz olurdu.
 */
const db = serviceDb();
const health = new SystemHealthService(db);

const stamp = Date.now();
const createdIds: string[] = [];

const metrics: SystemHealthMetrics = {
  system: {
    loadAvg: [0.7, 0.6, 0.5],
    cpuCount: 2,
    memTotalMb: 2048,
    memUsedMb: 900,
    memAvailableMb: 1148,
    swapTotalMb: 1024,
    swapUsedMb: 12,
    diskTotalGb: 40,
    diskUsedGb: 11.5,
    diskUsedPct: 29,
    uptimeSec: 3600,
  },
  processes: { pm2: [{ name: `web-${stamp}`, status: 'online', restarts: 2, memoryMb: 280, cpuPct: 1.5 }] },
  services: { webUp: true, caddyActive: true, certDaysLeft: 42 },
  app: { errorLogsLastHour: 0, failedJobsLastHour: 0 },
};

afterAll(async () => {
  for (const id of createdIds) await db.from('system_health_snapshot').delete().eq('id', id);
});

describe('kayıt ve okuma', () => {
  it('jsonb gidiş-dönüşü alan alan korunur — ondalık ve dizi dahil', async () => {
    const row = await health.record('warn', metrics);
    createdIds.push(row.id);

    expect(row.status).toBe('warn');
    // Dizi (`loadAvg`) ve ondalık (`diskUsedGb`) en kırılgan iki alan: snake/camel dönüşümü jsonb'nin
    // İÇİNE girmemeli, yoksa `memTotalMb` gibi anahtarlar `mem_total_mb` olarak geri gelirdi.
    expect(row.metrics.system.loadAvg).toEqual([0.7, 0.6, 0.5]);
    expect(row.metrics.system.diskUsedGb).toBe(11.5);
    expect(row.metrics.processes.pm2[0]?.restarts).toBe(2);
    expect(row.metrics.services.certDaysLeft).toBe(42);
  });

  it('`latest` EN SON satırı verir', async () => {
    const older = await health.record('ok', metrics);
    createdIds.push(older.id);
    const newest = await health.record('crit', metrics);
    createdIds.push(newest.id);

    expect((await health.latest())?.id).toBe(newest.id);
  });

  it('pencere okuması eşikten eskiyi getirmez ve ARTAN sırada gelir (grafik sırası)', async () => {
    const cutoff = new Date(Date.now() - 60_000).toISOString();
    const rows = await health.since(cutoff);

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.createdAt >= cutoff)).toBe(true);
    const stamps = rows.map((r) => r.createdAt);
    expect([...stamps].sort()).toEqual(stamps);
  });
});

describe('saklama süpürmesi', () => {
  it('eşikten eski görüntüleri siler, yenileri bırakır', async () => {
    const stale = await health.record('ok', metrics);
    createdIds.push(stale.id);
    const old = new Date(Date.now() - 30 * 86_400_000).toISOString();
    await db.from('system_health_snapshot').update({ created_at: old }).eq('id', stale.id);

    // Küresel sayıya bakmıyoruz (başka ajanın satırları oynatırdı) — kendi satırımızın kaybını sınıyoruz.
    const removed = await health.deleteBefore(new Date(Date.now() - 14 * 86_400_000).toISOString());
    expect(removed).toBeGreaterThanOrEqual(1);

    const { data } = await db.from('system_health_snapshot').select('id').eq('id', stale.id);
    expect(data ?? []).toHaveLength(0);
  });
});
