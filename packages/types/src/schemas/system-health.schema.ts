import { z } from 'zod';
import { HealthStatusEnum } from './enums.schema';

// SystemHealthSnapshot — sunucunun iki dakikalık anlık görüntüsü (18.5). `OBSERVABILITY §2`,
// tablo `0040_system_health.sql`.
//
// Tabloda tek `jsonb` var; alan doğrulamasının TEK sahibi bu dosyadır. Kolon açmadığımız için
// şemanın sıkılığı burada telafi ediliyor — gevşek bırakılsaydı jsonb gerçekten çöp kutusu olurdu.

/** Sunucu düzeyi metrikler (`/proc/meminfo` · `df` · `os.*`). */
export const HealthSystemSchema = z.object({
  /** 1 / 5 / 15 dakika yük ortalaması. Tek başına anlamsız — `cpuCount`'a göre okunur. */
  loadAvg: z.tuple([z.number(), z.number(), z.number()]),
  cpuCount: z.number().int().nonnegative(),
  memTotalMb: z.number().nonnegative(),
  memUsedMb: z.number().nonnegative(),
  /**
   * `MemAvailable` — "boş" (`MemFree`) DEĞİL. Linux boş belleği önbelleğe verir; boş bakan bir eşik
   * her sağlıklı sunucuyu kritik gösterirdi. Kullanılabilir, işletim sisteminin "istersen veririm"
   * dediği miktardır.
   */
  memAvailableMb: z.number().nonnegative(),
  swapTotalMb: z.number().nonnegative(),
  swapUsedMb: z.number().nonnegative(),
  /**
   * Disk. **`null` = ÖLÇÜLEMEDİ** (`df` düştü), sıfır değil — ve ayrım kritik: sıfır "disk boş"
   * demektir ve eşiklerden `ok` çıkar, yani **bozuk bir ölçüm sağlıklı bir disk gibi okunur**.
   * İlk yazımda bu alanlar sıfıra düşüyordu ve hata tam böyle doğmuştu (30.07 denetimi).
   */
  diskTotalGb: z.number().nonnegative().nullable(),
  diskUsedGb: z.number().nonnegative().nullable(),
  diskUsedPct: z.number().nonnegative().nullable(),
  uptimeSec: z.number().nonnegative(),
});

/** Tek bir PM2 süreç özeti (`pm2 jlist`). */
export const HealthProcessSchema = z.object({
  name: z.string(),
  /** 'online' | 'errored' | 'stopped' … — serbest metin, PM2'nin sözlüğü bizim değil. */
  status: z.string(),
  /**
   * Yeniden başlama sayısı — SESSİZ ARIZANIN en iyi göstergesi: süreç "online" görünür ama gece
   * boyu kırk kez düşüp kalkmış olabilir.
   */
  restarts: z.number().int().nonnegative(),
  memoryMb: z.number().nonnegative(),
  cpuPct: z.number().nonnegative(),
});

export const HealthProcessesSchema = z.object({
  /**
   * **`null` = PM2 OKUNAMADI**, boş dizi değil. Boş dizi "hiçbir süreç düşmemiş" diye okunur ve
   * hüküm `ok` çıkar — oysa süreç yöneticisine ulaşılamıyorsa hiçbir şey bilinmiyordur. Aynı
   * fail-open hatası (30.07 denetimi).
   */
  pm2: z.array(HealthProcessSchema).nullable(),
});

export const HealthServicesSchema = z.object({
  /** Web sunucusu içeriden denetlendi mi (localhost isteği). */
  webUp: z.boolean(),
  /** Ters vekil etkin mi — süreçler "online" olsa da bu düşerse site erişilemez; ayrı soru. */
  caddyActive: z.boolean(),
  /** HTTPS sertifikası kaç gün sonra doluyor. `null` = ÖLÇÜLEMEDİ (sıfır değil — bilinmemek bir ölçüm değildir). */
  certDaysLeft: z.number().nullable(),
});

/** Uygulama düzeyi — makine rahat ama uygulama bozuk olabilir; bu ayrı bir soru. */
export const HealthAppSchema = z.object({
  errorLogsLastHour: z.number().int().nonnegative(),
  failedJobsLastHour: z.number().int().nonnegative(),
});

export const SystemHealthMetricsSchema = z.object({
  system: HealthSystemSchema,
  processes: HealthProcessesSchema,
  services: HealthServicesSchema,
  app: HealthAppSchema,
});
export type SystemHealthMetrics = z.infer<typeof SystemHealthMetricsSchema>;

export const SystemHealthSnapshotSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string(),
  status: HealthStatusEnum,
  metrics: SystemHealthMetricsSchema,
});
export type SystemHealthSnapshot = z.infer<typeof SystemHealthSnapshotSchema>;

export const SystemHealthSnapshotInsertSchema = z.object({
  status: HealthStatusEnum,
  metrics: SystemHealthMetricsSchema,
});
export type SystemHealthSnapshotInsert = z.infer<typeof SystemHealthSnapshotInsertSchema>;

export const SystemHealthSnapshotUpdateSchema = SystemHealthSnapshotSchema.partial().required({ id: true });
export type SystemHealthSnapshotUpdate = z.infer<typeof SystemHealthSnapshotUpdateSchema>;
