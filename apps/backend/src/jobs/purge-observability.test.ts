import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErrorLogService, SystemHealthService, serviceDb } from '@lezzet/database';
import { mustDelete } from '@lezzet/database/testing';
import type { SystemHealthMetrics } from '@lezzet/types';
import { purgeObservabilityJob } from './purge-observability';

/**
 * Gözlemleme süpürmesi (18.11 · denetim T4). **Bu iş VERİ SİLİYOR** — sarmalayıcı testi
 * atlanabilir ama bunun testi atlanamaz: yanlış süpüren bir iş, kaybettiği şeyi hiçbir yerde
 * bildirmez.
 *
 * Sınanan iki değişmez: **çözülmemiş hata SÜPÜRÜLMEZ** (açık sorun silinince kaybolmaz, yalnız
 * görünmez olur — ve görünmeyen sorun, olmayan sorun sanılır) ve iki ayrı saklama eşiği
 * (çözülmüş hata 90 gün, sağlık görüntüsü 14 gün) birbirine karışmaz.
 *
 * **Küresel sayıya bakılmıyor** (CLAUDE §4b): iş tüm tabloyu süpürüyor ve başka bir ajanın eski
 * satırları da gidebilir. Ölçüt yalnız bu testin kurduğu satırların akıbeti.
 */
const db = serviceDb();
const errors = new ErrorLogService(db);
const health = new SystemHealthService(db);

const stamp = Date.now();
const damga = (ne: string) => `test-purge-${ne}-${stamp}`;
const KAYNAK = damga('kaynak');

const GUN_MS = 24 * 60 * 60 * 1000;
const gunOnce = (gun: number) => new Date(Date.now() - gun * GUN_MS).toISOString();

/**
 * Geçerli bir görüntü — şema SIKI (jsonb çöp kutusu olmasın diye) ve gevşek bir sahte veri
 * okumada `parse`'ta patlardı. Değerler önemsiz; testin konusu içerik değil YAŞ.
 */
const METRIK: SystemHealthMetrics = {
  system: {
    loadAvg: [0, 0, 0],
    cpuCount: 1,
    memTotalMb: 1024,
    memUsedMb: 256,
    memAvailableMb: 768,
    swapTotalMb: 0,
    swapUsedMb: 0,
    diskTotalGb: 10,
    diskUsedGb: 1,
    diskUsedPct: 10,
    uptimeSec: 60,
  },
  processes: { pm2: [] },
  services: { webUp: true, caddyActive: null, certDaysLeft: null },
  app: { errorLogsLastHour: 0, failedJobsLastHour: 0 },
};

/** Kurulan hata kayıtlarının kimlikleri — mesaja göre bulunur, damga her koşuda benzersiz. */
let cozulmusEski: string;
let cozulmemisEski: string;
let cozulmusTaze: string;
let snapshotEski: string;
let snapshotTaze: string;

/** Hata kaydı RPC ile açılır (tek kapı), sonra tarihleri geçmişe damgalanır. */
async function hataKur(mesaj: string, opts: { yasGun: number; cozuldu: boolean }): Promise<string> {
  await errors.capture({ source: KAYNAK, message: mesaj });
  const { data, error } = await db.from('error_log').select('id').eq('message', mesaj).single();
  if (error) throw error;
  const id = (data as { id: string }).id;

  const yama: Record<string, string> = { created_at: gunOnce(opts.yasGun), last_seen_at: gunOnce(opts.yasGun) };
  // Süpürme ölçütü `resolved_at` — "ne zaman doğdu" değil, "ne zaman kapandı".
  if (opts.cozuldu) yama.resolved_at = gunOnce(opts.yasGun);
  const { error: yamaHatasi } = await db.from('error_log').update(yama).eq('id', id);
  if (yamaHatasi) throw yamaHatasi;
  return id;
}

beforeAll(async () => {
  cozulmusEski = await hataKur(damga('cozulmus-eski'), { yasGun: 120, cozuldu: true });
  cozulmemisEski = await hataKur(damga('cozulmemis-eski'), { yasGun: 120, cozuldu: false });
  cozulmusTaze = await hataKur(damga('cozulmus-taze'), { yasGun: 3, cozuldu: true });

  const eski = await health.record('ok', METRIK);
  const taze = await health.record('ok', METRIK);
  snapshotEski = eski.id;
  snapshotTaze = taze.id;
  const { error } = await db.from('system_health_snapshot').update({ created_at: gunOnce(30) }).eq('id', snapshotEski);
  if (error) throw error;
});

afterAll(async () => {
  // Süpürmenin sağ bıraktıkları elle toplanır — purge'ün bildiği bir hedef değiller ve bu satırlar
  // damgalı, yani başka bir ajanın verisine dokunma riski yok.
  await mustDelete(db, 'error_log', (q) => q.eq('source', KAYNAK));
  await mustDelete(db, 'system_health_snapshot', (q) => q.in('id', [snapshotEski, snapshotTaze]));
});

async function varMi(tablo: string, id: string): Promise<boolean> {
  const { data } = await db.from(tablo).select('id').eq('id', id).maybeSingle();
  return data !== null;
}

describe('gözlemleme süpürmesi', () => {
  it('süresi dolanı siler, ÇÖZÜLMEMİŞ hatayı ne kadar eski olursa olsun bırakır', async () => {
    const sonuc = await purgeObservabilityJob();
    // Sayaçlar en az kendi satırlarımızı kapsamalı; üstü başka ajanın eski verisi olabilir.
    expect(Number(sonuc.errors)).toBeGreaterThanOrEqual(1);

    expect(await varMi('error_log', cozulmusEski)).toBe(false);
    // Değişmezin kalbi: 120 günlük ama HÂLÂ AÇIK bir hata duruyor.
    expect(await varMi('error_log', cozulmemisEski)).toBe(true);
    expect(await varMi('error_log', cozulmusTaze)).toBe(true);
  });

  it('iki eşik birbirine karışmaz — 30 günlük görüntü gider, tazesi kalır', async () => {
    await purgeObservabilityJob();
    expect(await varMi('system_health_snapshot', snapshotEski)).toBe(false);
    expect(await varMi('system_health_snapshot', snapshotTaze)).toBe(true);
  });

  it('ikinci tur no-op — iş taramalı ve idempotent', async () => {
    await purgeObservabilityJob();
    const sonuc = await purgeObservabilityJob();
    expect(sonuc).toMatchObject({ errors: 0, snapshots: 0 });
  });
});
