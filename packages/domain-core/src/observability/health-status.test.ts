import { describe, expect, it } from 'vitest';
import type { SystemHealthMetrics } from '@lezzet/types';
import { healthStatusOf, loadCapacityPercent, HEALTH_THRESHOLDS } from './health-status';

/**
 * Sağlık hükmü (18.5). Sınanan şey ayrımın kendisi: **`crit` bir şeyin ÇALIŞMADIĞI, `warn` baskı
 * altında olduğu** hâl. Her uyarıyı kritik saymak, gerçekten kritik olanı görünmez yapardı.
 *
 * Eşikler sabit ve burada testli — ayar tablosuna taşınmadıklarının karşılığı bu (`data-model/operasyon.md`).
 */
const healthy: SystemHealthMetrics = {
  system: {
    loadAvg: [0.4, 0.5, 0.6],
    cpuCount: 4,
    memTotalMb: 4000,
    memUsedMb: 1500,
    memAvailableMb: 2500,
    swapTotalMb: 2000,
    swapUsedMb: 0,
    diskTotalGb: 80,
    diskUsedGb: 20,
    diskUsedPct: 25,
    uptimeSec: 86_400,
  },
  processes: { pm2: [{ name: 'web', status: 'online', restarts: 0, memoryMb: 300, cpuPct: 2 }] },
  services: { webUp: true, caddyActive: true, certDaysLeft: 60 },
  app: { errorLogsLastHour: 0, failedJobsLastHour: 0 },
};

/** Derin kopya + tek alan değişimi — fikstürü bozmadan tek koşul sınanır. */
function withSystem(patch: Partial<SystemHealthMetrics['system']>): SystemHealthMetrics {
  return { ...healthy, system: { ...healthy.system, ...patch } };
}

describe('healthStatusOf', () => {
  it('rahat sunucu ok — en sık görülecek hâl', () => {
    expect(healthStatusOf(healthy)).toBe('ok');
  });

  describe('crit — bir şey çalışmıyor', () => {
    it('online olmayan süreç', () => {
      const metrics = { ...healthy, processes: { pm2: [{ name: 'web', status: 'errored', restarts: 12, memoryMb: 0, cpuPct: 0 }] } };
      expect(healthStatusOf(metrics)).toBe('crit');
    });

    it('web ayakta değil', () => {
      expect(healthStatusOf({ ...healthy, services: { ...healthy.services, webUp: false } })).toBe('crit');
    });

    it('ters vekil düşmüş — süreçler ayakta olsa da site erişilemez', () => {
      expect(healthStatusOf({ ...healthy, services: { ...healthy.services, caddyActive: false } })).toBe('crit');
    });

    it('disk eşiğe dayandı', () => {
      expect(healthStatusOf(withSystem({ diskUsedPct: HEALTH_THRESHOLDS.diskCritPct }))).toBe('crit');
    });

    it('kullanılabilir bellek tükendi', () => {
      expect(healthStatusOf(withSystem({ memAvailableMb: HEALTH_THRESHOLDS.memCritAvailableMb - 1 }))).toBe('crit');
    });

    it('sertifika bir hafta içinde doluyor', () => {
      expect(healthStatusOf({ ...healthy, services: { ...healthy.services, certDaysLeft: 3 } })).toBe('crit');
    });

    it('ÖLÇÜM BAYAT — izlemenin durduğu hâl, izlemenin en tehlikeli hâlidir', () => {
      expect(healthStatusOf(healthy, HEALTH_THRESHOLDS.staleCritMinutes)).toBe('crit');
      // Sınırın altında hüküm değişmez: iki dakikada bir toplanan veri altı dakika sonra hâlâ tazedir.
      expect(healthStatusOf(healthy, 6)).toBe('ok');
    });
  });

  describe('warn — baskı altında ama ayakta', () => {
    it('disk uyarı eşiği', () => {
      expect(healthStatusOf(withSystem({ diskUsedPct: HEALTH_THRESHOLDS.diskWarnPct }))).toBe('warn');
    });

    it('swap kullanımı: çalışıyor ama yavaşlamış — ayrı bir haber', () => {
      expect(healthStatusOf(withSystem({ swapUsedMb: 1200 }))).toBe('warn');
    });

    it('yük çekirdek sayısını aştı — ham sayı değil, KAPASİTE ölçüsü', () => {
      // 4 çekirdekte 4.1 doygunluk; 2 çekirdekte 2.4 de doygunluk. Ölçüt oran.
      expect(healthStatusOf(withSystem({ loadAvg: [4.1, 3, 2] }))).toBe('warn');
      expect(healthStatusOf(withSystem({ loadAvg: [3.9, 3, 2] }))).toBe('ok');
    });

    it('son bir saatte hata yağmış — makine rahat, uygulama bozuk', () => {
      const metrics = { ...healthy, app: { errorLogsLastHour: HEALTH_THRESHOLDS.errorsWarnPerHour + 1, failedJobsLastHour: 0 } };
      expect(healthStatusOf(metrics)).toBe('warn');
    });

    it('cron düşmüşse eşik YOK — bir tur bile haberdir', () => {
      expect(healthStatusOf({ ...healthy, app: { errorLogsLastHour: 0, failedJobsLastHour: 1 } })).toBe('warn');
    });

    it('sertifika iki hafta içinde doluyor', () => {
      expect(healthStatusOf({ ...healthy, services: { ...healthy.services, certDaysLeft: 10 } })).toBe('warn');
    });
  });

  describe('ölçülemeyen değer uyarı doğurmaz', () => {
    it('sertifika okunamadıysa (null) hüküm bozulmaz — bilinmemek bir ölçüm değildir', () => {
      expect(healthStatusOf({ ...healthy, services: { ...healthy.services, certDaysLeft: null } })).toBe('ok');
    });

    it('swap yoksa (0) oran hesabı uyarı üretmez', () => {
      expect(healthStatusOf(withSystem({ swapTotalMb: 0, swapUsedMb: 0 }))).toBe('ok');
    });

    it('süreç LİSTESİ boşsa (hiç süreç yok) arıza varsayılmaz', () => {
      expect(healthStatusOf({ ...healthy, processes: { pm2: [] } })).toBe('ok');
    });
  });

  /**
   * **ÖLÇÜM BOŞLUĞU kendi başına uyarıdır** — 30.07 denetiminin bulgusu.
   *
   * İlk yazımda `df` düşünce disk sıfıra, `pm2` okunamayınca boş diziye düşüyordu; ikisi de
   * eşiklerden `ok` çıkarıyordu. Yani **bozuk bir ölçüm sağlıklı bir sistem gibi okunuyordu** ve
   * bunu doğrulayan bir test bile yazılmıştı (hatayı sertifikalamak). E-posta alarmı bilinçli
   * olarak yokken ekranın "göremiyorum" demesi şart: "göremiyorum" ile "sorun yok" aynı şey değil.
   */
  describe('ölçülemeyen metrik sağlıklı SAYILMAZ', () => {
    it('disk ölçülemediyse uyarı', () => {
      expect(healthStatusOf(withSystem({ diskUsedPct: null, diskTotalGb: null, diskUsedGb: null }))).toBe('warn');
    });

    it('süreç listesi OKUNAMADIYSA (null) uyarı — boş listeyle karıştırılmaz', () => {
      expect(healthStatusOf({ ...healthy, processes: { pm2: null } })).toBe('warn');
    });

    it('ama gerçek bir arıza varken hüküm yine crit — boşluk kritiği gölgelemez', () => {
      const metrics = { ...withSystem({ diskUsedPct: null }), services: { ...healthy.services, webUp: false } };
      expect(healthStatusOf(metrics)).toBe('crit');
    });
  });

  it('crit, warn koşulu da tutsa bile crit kalır — ağır hüküm hafifi ezer', () => {
    const metrics = withSystem({ diskUsedPct: 95, swapUsedMb: 1800 });
    expect(healthStatusOf(metrics)).toBe('crit');
  });
});

describe('loadCapacityPercent', () => {
  it('yükü çekirdeğe böler — 100 % tam kapasite', () => {
    expect(loadCapacityPercent(2, 4)).toBe(50);
    expect(loadCapacityPercent(4, 4)).toBe(100);
    expect(loadCapacityPercent(6, 4)).toBe(150);
  });

  it('çekirdek sayısı bilinmiyorsa sıfır döner — sıfıra bölmez', () => {
    expect(loadCapacityPercent(2, 0)).toBe(0);
  });
});
