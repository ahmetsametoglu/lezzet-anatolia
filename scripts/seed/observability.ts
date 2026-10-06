import { errorFingerprint, SystemHealthService } from '@lezzet/database';
import { healthStatusOf } from '@lezzet/domain-core';
import type { SystemHealthMetrics } from '@lezzet/types';
import { tabloDolu, type Db } from './shared';

// Sağlık görüntüsü ve hata kaydı: iki tabloyu backend cron'u doldurur ve yerelde backend çoğu zaman koşmaz; ekran en kötü hâlinde
// denenebilsin diye seed'lenir. Hüküm elle yazılmaz, `healthStatusOf` hesaplar; yoksa seed yanlış eşiği gizleyen bir dekor olurdu.

/** Son görüntünün anlatısı: disk eşiği aşmış, sertifika penceresi açılmış, bir süreç düşüp kalkmış. */
const SIMDIKI_DISK_PCT = 84;
/** Yedi gün önce disk buradaydı — trendin "yönü yukarı" cümlesi bu farktan doğuyor. */
const HAFTA_ONCE_DISK_PCT = 60;

const DK = 60_000;
const CEKIRDEK = 4;
const MEM_TOPLAM_MB = 7936;

/** `n` dakika öncesinin ISO damgası — bu tabloların çözünürlüğü gün değil dakika. */
const dakikaOnce = (n: number): string => new Date(Date.now() - n * DK).toISOString();

/** Kapatılan hatanın aktörü seed'in açtığı yöneticidir; bulunamazsa `null`, çünkü yanlış kimlik "kim kapattı" sorusuna yalan söyler. */
async function yoneticiId(db: Db): Promise<string | null> {
  const { data } = await db.from('user_profiles').select('id').contains('roles', ['admin']).limit(1).maybeSingle();
  return data?.id ?? null;
}

/** Bir anın metrikleri; dalga sinüsle üretilir, çünkü düz çizgi grafiği "veri yok" gibi gösterir. */
function goruntu(yasDk: number): SystemHealthMetrics {
  const t = yasDk / (7 * 24 * 60); // 0 = şimdi, 1 = yedi gün önce
  const dalga = (genlik: number, faz: number) => Math.sin(yasDk / 47 + faz) * genlik;

  // Disk yedi günde dolar; kritik pencere bilinçli olarak geçmişte, çünkü sürekli kırmızı ekran alarmın anlamını yok eder.
  const kritikPencere = yasDk > 2760 && yasDk < 3000; // ~46–50 saat önce
  const diskPct = kritikPencere
    ? 92.4
    : Math.round((SIMDIKI_DISK_PCT - (SIMDIKI_DISK_PCT - HAFTA_ONCE_DISK_PCT) * t + dalga(0.6, 1)) * 10) / 10;
  const memAvailable = Math.round(1290 + 2600 * t + dalga(140, 3));
  const load1 = Math.round((2.1 - 1.5 * t + dalga(0.5, 5)) * 100) / 100;

  // Bir pencere bilinçli ölçülemedi; "sıfır değil, bilinmiyor" çizimi ancak böyle bir aralıkla denenir.
  const diskOlculemedi = yasDk > 360 && yasDk < 540;

  return {
    system: {
      loadAvg: [load1, Math.round((load1 + 0.2) * 100) / 100, Math.round((load1 + 0.1) * 100) / 100],
      cpuCount: CEKIRDEK,
      memTotalMb: MEM_TOPLAM_MB,
      memUsedMb: MEM_TOPLAM_MB - memAvailable,
      memAvailableMb: memAvailable,
      swapTotalMb: 2048,
      // Swap yalnız son üç saatte kullanımda: "sunucu çalışır ama yavaşlamıştır" satırı görünsün.
      swapUsedMb: yasDk < 180 ? 340 : 0,
      diskTotalGb: diskOlculemedi ? null : 78,
      diskUsedGb: diskOlculemedi ? null : Math.round(78 * (diskPct / 100) * 10) / 10,
      diskUsedPct: diskOlculemedi ? null : diskPct,
      // Sakin hâl: "beklenmeyen yeniden başlatma" notu çıkmamalı.
      uptimeSec: 14 * 86_400 - yasDk * 60,
    },
    processes: {
      pm2: [
        { name: 'web-server', status: 'online', restarts: 0, memoryMb: 264, cpuPct: 3.4 },
        // Üç yeniden başlama: süreç "online" görünürken sessizce düşüp kalkmış — `info` sinyali.
        { name: 'backend-http', status: 'online', restarts: yasDk < 240 ? 3 : 0, memoryMb: 402, cpuPct: 6.1 },
        { name: 'backend-cron', status: 'online', restarts: 0, memoryMb: 112, cpuPct: 0.4 },
      ],
    },
    // Seed sunucuyu taklit eder; `null` hâli yerelde gerçek toplayıcıdan gelir. Sertifika günü azalır ki seri üç hükmü de taşısın.
    services: { webUp: true, caddyActive: true, certDaysLeft: Math.round(12 + yasDk / (24 * 60) * 9) },
    app: {
      errorLogsLastHour: yasDk < 60 ? 6 : 0,
      failedJobsLastHour: yasDk < 60 ? 2 : 0,
    },
  };
}

/** Görüntü zamanları yakında sık, geçmişte seyrek: ekranın dört penceresine nokta yeter, beş bin satır yalnız süre katardı. */
function zamanlar(): number[] {
  const out: number[] = [];
  for (let dk = 0; dk < 120; dk += 2) out.push(dk); // son 2 saat · gerçek sıklık
  for (let dk = 120; dk < 24 * 60; dk += 10) out.push(dk); // 2 sa – 24 sa
  for (let dk = 24 * 60; dk <= 7 * 24 * 60; dk += 30) out.push(dk); // 1 – 7 gün
  return out;
}

export async function seedSystemHealth(db: Db): Promise<void> {
  if (await tabloDolu(db, 'system_health_snapshot')) {
    console.log('▸ sağlık görüntüsü zaten dolu — atlandı');
    return;
  }
  const health = new SystemHealthService(db);
  const anlar = zamanlar();

  for (const yasDk of anlar) {
    const metrics = goruntu(yasDk);
    const snapshot = await health.record(healthStatusOf(metrics), metrics);
    // Damga insert'te "şimdi" düşüyor; görüntünün ANLAMI zamanında, o yüzden geriye alınır.
    const { error } = await db.from('system_health_snapshot').update({ created_at: dakikaOnce(yasDk) }).eq('id', snapshot.id);
    if (error) throw error;
  }

  // Hüküm dağılımı sayılır ki bir eşik değişip seri tek renge düşerse görünsün.
  const dagilim = anlar.reduce<Record<string, number>>((m, dk) => {
    const h = healthStatusOf(goruntu(dk));
    return { ...m, [h]: (m[h] ?? 0) + 1 };
  }, {});
  console.log(
    `✓ sağlık görüntüsü: ${anlar.length} satır · 7 gün · hüküm dağılımı ${Object.entries(dagilim).map(([k, v]) => `${k}=${v}`).join(' · ')} ` +
      `· son hüküm "${healthStatusOf(goruntu(0))}" (disk %${HAFTA_ONCE_DISK_PCT} → %${SIMDIKI_DISK_PCT}, ~2 gün önce %92 KRİTİK, 6–9 sa arası ÖLÇÜLEMEDİ)`,
  );
}

// Satır hata türüdür, sayacı tekrar sayısıdır. Parmak izi servisin fonksiyonuyla hesaplanır; uydurma anahtar gruplamayı sınamazdı.

interface HataTohumu {
  level: 'warning' | 'error' | 'fatal';
  source: string;
  message: string;
  path?: string;
  stack: string;
  context: Record<string, unknown>;
  count: number;
  /** Kaç gün önce ilk görüldü / son görüldü. */
  ilkGunOnce: number;
  sonDkOnce: number;
  /** Dolu ise satır çözülmüş; sayı = kaç gün önce kapatıldı. */
  cozuldu?: number;
  /** `true` ise bu satırın parmak izi ÇÖZÜLMÜŞ bir ikizle eşleşir → ekran "geri geldi" der. */
  regresyon?: boolean;
}

const HATALAR: HataTohumu[] = [
  {
    level: 'warning',
    source: 'web-action',
    message: 'Sepet güncelleme: stok kilidi 2000ms içinde alınamadı, işlem yeniden denendi',
    path: '/api/cart/update',
    stack:
      'LockTimeoutError: could not acquire lock "cart:lock" within 2000ms\n    at withLock (/srv/lezzet/apps/web/lib/lock.ts:44:11)\n    at updateCartLine (/srv/lezzet/apps/web/app/(shop)/cart/actions.ts:96:20)\n    at async runAction (/srv/lezzet/apps/web/lib/error.ts:58:12)',
    context: { lock: 'cart:lock', retry: 'succeeded' },
    count: 212,
    ilkGunOnce: 12,
    sonDkOnce: 18,
  },
  {
    level: 'error',
    source: 'backend-cron',
    message: 'Cron: stok senkronizasyonu tamamlanamadı — tedarikçi yanıtı zaman aşımına düştü',
    stack:
      'Error: connect ETIMEDOUT 51.15.204.88:443\n    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1595:16)\n    at /srv/lezzet/apps/backend/src/jobs/supply-sync.ts:118:22\n    at async runJob (/srv/lezzet/apps/backend/src/jobs/runner.ts:64:5)',
    context: { jobName: 'supply_sync', attempt: '3/3', supplierId: 'SUP-114' },
    count: 34,
    ilkGunOnce: 7,
    sonDkOnce: 140,
  },
  {
    level: 'error',
    source: 'webhook',
    message: 'aktarım hesabı ayarı yok — aktarım ana hesaba yazılamadı (Ayarlar → Ödeme)',
    path: '/api/webhooks/revolut',
    stack:
      'Error: aktarım hesabı ayarı yok — aktarım ana hesaba yazılamadı (Ayarlar → Ödeme)\n    at recordPayout (/srv/lezzet/apps/web/lib/order/payment-webhook.ts:165:30)\n    at handlePaymentEvent (/srv/lezzet/apps/web/lib/order/payment-webhook.ts:52:27)',
    context: { provider: 'revolut', kind: 'payout_completed' },
    count: 7,
    ilkGunOnce: 2,
    sonDkOnce: 95,
  },
  {
    level: 'warning',
    source: 'web-server',
    message: 'Yanıt süresi 3000ms üzerinde: katalog sayfası (3184ms)',
    path: '/catalogue',
    stack:
      'SlowResponseWarning: /catalogue rendered in 3184ms (threshold 3000ms)\n    at reportSlow (/srv/lezzet/apps/web/lib/telemetry.ts:71:9)\n    at renderPage (/srv/lezzet/apps/web/app/(shop)/catalogue/page.tsx:118:3)',
    context: { cache: 'MISS', products: 42, filters: 6 },
    count: 48,
    ilkGunOnce: 9,
    sonDkOnce: 320,
  },
  {
    // Aşağıda aynı parmak izinin çözülmüş ikizi var; ekranın "geri geldi" rozeti bunu okur.
    level: 'error',
    source: 'backend-http',
    message: 'Kurye atama: rota servisi 502 döndü, atama yapılamadı',
    path: '/api/routes/assign',
    stack:
      'UpstreamError: 502 Bad Gateway from route-service\n    at assignCourier (/srv/lezzet/apps/backend/src/http/routes/assign.ts:57:13)\n    at async dispatch (/srv/lezzet/apps/backend/src/http/server.ts:88:9)',
    context: { upstream: 'route-service', attempt: '3/3' },
    count: 5,
    ilkGunOnce: 1,
    sonDkOnce: 42,
    regresyon: true,
  },
  {
    level: 'warning',
    source: 'backend-cron',
    message: 'E-posta kuyruğu: 2 iş yeniden kuyruğa alındı',
    stack:
      'RetryScheduled: 2 job(s) requeued in queue "mail"\n    at requeue (/srv/lezzet/apps/backend/src/jobs/runner.ts:132:7)',
    context: { queue: 'mail', jobs: 2 },
    count: 19,
    ilkGunOnce: 8,
    sonDkOnce: 1400,
  },
  {
    // FATAL: akış tamamen koptu. Tasarımın en yüksek sesli satırı — dolu kırmızı rozet, kırmızı zemin.
    level: 'fatal',
    source: 'backend-http',
    message: 'Disk yazma hatası: /var/lib/uploads üzerinde alan kalmadı',
    path: '/api/media/upload',
    stack:
      'Error: ENOSPC: no space left on device, write\n    at writeSync (node:fs:936:3)\n    at /srv/lezzet/apps/backend/src/media/store.ts:88:14',
    context: { target: '/var/lib/uploads', diskUsedPct: 96 },
    count: 41,
    ilkGunOnce: 1,
    sonDkOnce: 6,
  },
  {
    level: 'warning',
    source: 'web-action',
    message: 'Görsel yükleme: 2000 px altı dosya reddedildi',
    path: '/api/media/upload',
    stack: 'ValidationError: uzun kenar 1440 px < 2000 px\n    at validateUpload (/srv/lezzet/apps/web/lib/media/validate.ts:29:11)',
    context: { rule: 'longEdge >= 2000px' },
    count: 63,
    ilkGunOnce: 19,
    sonDkOnce: 5760,
    cozuldu: 3,
  },
  {
    level: 'error',
    source: 'backend-cron',
    message: 'Sertifika yenileme betiği hata verdi',
    stack: 'RenewalScriptError: acme.sh exited with status 2\n    at /srv/lezzet/ops/renew-cert.sh:14',
    context: { script: 'renew-cert.sh', exitCode: 2 },
    count: 3,
    ilkGunOnce: 11,
    sonDkOnce: 14_400,
    cozuldu: 9,
  },
];

/** Regresyonun kapalı ikizi — mesajı ve stack'i AYNI, yoksa parmak izi tutmaz ve rozet çıkmaz. */
const REGRESYON_IKIZI = HATALAR.find((h) => h.regresyon);

/**
 * Örnek kaydın işareti: `captureError` gerçek arızaları da bu tabloya yazar ve kurgu satırlarla karışmasın gerekir. İşaret mesajın
 * içindedir, çünkü parmak izi mesajdan türer ve işaretli satır gerçek hatayla gruplanamaz.
 */
const ORNEK_ONEKI = '[ÖRNEK]';

/** `SEED_ERROR_LOG=0` örnek hata kaydını hiç yazmaz; varsayılan açık, çünkü sistem ekranının hâlleri kayıtsız denenemez. */
const ORNEK_HATA_YAZ = process.env.SEED_ERROR_LOG !== '0';

export async function seedErrorLog(db: Db): Promise<void> {
  if (!ORNEK_HATA_YAZ) {
    console.log('▸ hata kaydı seed KAPALI (SEED_ERROR_LOG=0) — tablo boş bırakıldı');
    return;
  }
  if (await tabloDolu(db, 'error_log')) {
    console.log('▸ hata kaydı zaten dolu — atlandı');
    return;
  }
  console.log('▸ HATA KAYDI seed');

  const aktor = await yoneticiId(db);

  const satirlar = HATALAR.map((h) => {
    // İşaret parmak izinin GİRDİSİNE de giriyor: önce mesaj işaretlenir, sonra izi hesaplanır.
    const message = `${ORNEK_ONEKI} ${h.message}`;
    return {
      fingerprint: errorFingerprint(h.source, message, h.stack),
      level: h.level,
      source: h.source,
      message,
      stack: h.stack,
      // `seed: true` makinenin okuduğu hâli: önek göze, bayrak sorguya (`context->>'seed'`).
      context: { ...h.context, seed: true },
      path: h.path ?? null,
      count: h.count,
      first_seen_at: new Date(Date.now() - h.ilkGunOnce * 86_400_000).toISOString(),
      last_seen_at: dakikaOnce(h.sonDkOnce),
      resolved_at: h.cozuldu ? new Date(Date.now() - h.cozuldu * 86_400_000).toISOString() : null,
      resolved_by: h.cozuldu ? aktor : null,
      created_at: new Date(Date.now() - h.ilkGunOnce * 86_400_000).toISOString(),
    };
  });

  // Kısmi unique indeks yalnız açık satıra baktığı için kapalı ikiz yan yana durabilir.
  if (REGRESYON_IKIZI) {
    // Liste elle düzenlenen bir sabit; ikiz silinirse `undefined` yaymak yerine görünür biçimde durmalı.
    const ikiz = satirlar[HATALAR.indexOf(REGRESYON_IKIZI)];
    if (!ikiz) throw new Error('seed: regresyon ikizi listede yok — HATALAR ile REGRESYON_IKIZI ayrışmış');
    satirlar.push({
      ...ikiz,
      count: 11,
      first_seen_at: new Date(Date.now() - 6 * 86_400_000).toISOString(),
      last_seen_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
      resolved_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
      resolved_by: aktor,
      created_at: new Date(Date.now() - 6 * 86_400_000).toISOString(),
    });
  }

  // Ham insert: `capture` RPC'si sayacı birer artırır, seed ise yüksek sayacı tek satırda kurmalı.
  const { error } = await db.from('error_log').insert(satirlar);
  if (error) throw error;

  const acik = satirlar.filter((s) => !s.resolved_at).length;
  console.log(
    `✓ hata kaydı: ${satirlar.length} satır (${acik} açık · ${satirlar.length - acik} çözülmüş) · ` +
      `1 FATAL · 1 REGRESYON (aynı parmak izinin kapalı ikizi var) · hepsi "${ORNEK_ONEKI}" işaretli`,
  );
}
