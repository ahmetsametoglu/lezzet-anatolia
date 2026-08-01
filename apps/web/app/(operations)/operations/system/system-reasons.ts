import {
  HEALTH_COLLECT_INTERVAL_MIN,
  HEALTH_THRESHOLDS as T,
  loadCapacityPercent,
  type HealthSignal,
} from '@lezzet/domain-core';
import type { SystemHealthMetrics } from '@lezzet/types';
import type { HealthReasonView } from './system-types';

/**
 * Sinyal → Türkçe gerekçe cümlesi (18.5).
 *
 * **Metin neden motorda değil:** motor karar verir, dil arayüzün işidir (STACK §4). Aynı sinyal
 * ileride bir bildirimde ya da bir rapor satırında başka sözcüklerle görünebilir; cümleyi motora
 * gömmek, kararı bir dile bağlamak olurdu.
 *
 * **Neden gerekçe zorunlu:** kritik hatada e-posta gitmiyor (`OBSERVABILITY §4.1`), yani bu ekran
 * alarmın yerini tutuyor. Renk tek başına bilgi değildir — sebebi görünmeyen bir uyarı, görmezden
 * gelinen bir uyarıdır (`design/pages/admin-sistem.md §2`).
 *
 * **Eşik sayıları cümleye ELLE yazılmaz**, `HEALTH_THRESHOLDS`'tan okunur: ekranın söylediği eşikle
 * hükmü veren eşik bir gün ayrışırsa operatör panele değil kendi hafızasına güvenmeye başlar.
 */

/** Ölçüm boşluğu bildiren kodlar — nötr çizilir: haber tam olarak arıza OLMADIĞIDIR. */
const OLCUM_BOSLUGU = new Set(['disk-unknown', 'process-unknown', 'caddy-unknown', 'cert-unknown']);

const mb = (v: number): string => `${Math.round(v).toLocaleString('tr-TR')} MB`;
const gb = (v: number): string => `${(v / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} GB`;
const yuzde = (v: number, basamak = 0): string => `%${v.toLocaleString('tr-TR', { maximumFractionDigits: basamak })}`;

/** "14 gün 6 sa" · "3 sa 12 dk" · "44 dk" — çalışma süresi gün ölçeğinden dakikaya iner. */
export function uptimeLabel(seconds: number): string {
  const gun = Math.floor(seconds / 86_400);
  const saat = Math.floor((seconds % 86_400) / 3600);
  const dakika = Math.floor((seconds % 3600) / 60);
  if (gun > 0) return `${gun} gün ${saat} sa`;
  if (saat > 0) return `${saat} sa ${dakika} dk`;
  return `${dakika} dk`;
}

export function reasonViews(
  metrics: SystemHealthMetrics,
  signals: readonly HealthSignal[],
  ageMinutes: number,
): HealthReasonView[] {
  const { system: s, processes, services, app } = metrics;
  const dusenler = (processes.pm2 ?? []).filter((p) => p.status !== 'online');
  const cokBaslayan = (processes.pm2 ?? []).filter((p) => p.restarts >= T.restartsNoticeCount);

  const METIN: Record<string, { tag: string; text: string }> = {
    stale: {
      tag: 'ölçüm',
      text: `Son sağlık görüntüsü ${Math.floor(ageMinutes)} dk önce yazıldı; ${HEALTH_COLLECT_INTERVAL_MIN} dakikada bir gelmeliydi. Aşağıdaki değerler o ana ait — ya ölçüm işi durdu ya sunucu yanıt vermiyor, ikisi de arızadır.`,
    },
    'web-down': { tag: 'servis', text: 'Web sunucusu iç denetime yanıt vermiyor — istek karşılanmıyor.' },
    'caddy-down': {
      tag: 'servis',
      text: 'Caddy ters vekil kapalı — süreçler ne görünürse görünsün site dışarıdan erişilemez.',
    },
    'caddy-unknown': {
      tag: 'ölçülemedi',
      text: 'Ters vekilin durumu sorulamadı (systemd yok). "Kapalı" demek değil: göremiyoruz.',
    },
    'disk-crit': {
      tag: 'disk',
      text: `Disk ${yuzde(s.diskUsedPct ?? 0, 1)} dolu (eşik ${yuzde(T.diskCritPct)}): yükleme ve kayıt yazma hataları bu noktada başlar.`,
    },
    'disk-warn': {
      tag: 'disk',
      text: `Disk ${yuzde(s.diskUsedPct ?? 0, 1)} dolu (eşik ${yuzde(T.diskWarnPct)}). Anlamı yönünde: trendde eğrinin nereden geldiğine bakın.`,
    },
    'disk-unknown': {
      tag: 'ölçülemedi',
      text: 'Disk ölçülemedi — "%0 dolu" değil, bilinmiyor. Sıfır göstermek bozuk bir ölçümü sağlıklı bir disk gibi okutur.',
    },
    'mem-crit': {
      tag: 'bellek',
      text: `Kullanılabilir bellek ${mb(s.memAvailableMb)} (eşik ${mb(T.memCritAvailableMb)}); swap ${mb(s.swapUsedMb)} — sunucu takas üzerinde sürünüyor.`,
    },
    'mem-warn': {
      tag: 'bellek',
      text: `Kullanılabilir bellek ${mb(s.memAvailableMb)} (eşik ${mb(T.memWarnAvailableMb)}). "Kullanılabilir" ile "boş" aynı şey değil; eşik kullanılabilire bakar.`,
    },
    swap: {
      tag: 'swap',
      text: `Swap kullanımda: ${mb(s.swapUsedMb)} / ${gb(s.swapTotalMb)}. Ayrı bir haber — swap'a düşmüş sunucu çalışır ama yavaşlamıştır.`,
    },
    'process-down': {
      tag: 'süreç',
      text: `${dusenler.map((p) => `${p.name} ${p.status}`).join(' · ')} — "online" olmayan süreç, sitenin bir kısmının çalışmadığı anlamına gelir.`,
    },
    'process-unknown': {
      tag: 'ölçülemedi',
      text: 'PM2 okunamadı: süreç listesi boş değil, alınamadı. Göremediğimiz için hüküm uyarıya çekildi.',
    },
    'process-restarts': {
      tag: 'süreç',
      text: `${cokBaslayan.map((p) => `${p.name} ${p.restarts} kez`).join(' · ')} yeniden başladı; durumu "online" görünüyor. Yeniden başlama sayısı sessiz arızanın en iyi göstergesidir.`,
    },
    load: {
      tag: 'yük',
      text: `1 dakika yükü ${s.loadAvg[0].toLocaleString('tr-TR', { maximumFractionDigits: 2 })} — ${s.cpuCount} çekirdeğe oranla ${yuzde(loadCapacityPercent(s.loadAvg[0], s.cpuCount))} (eşik %100). Ham sayı tek başına bilgi değil.`,
    },
    errors: {
      tag: 'uygulama',
      text: `Son bir saatte ${app.errorLogsLastHour} hata kaydı (eşik ${T.errorsWarnPerHour}). Makine rahat olsa da uygulama bozuk olabilir.`,
    },
    'failed-jobs': {
      tag: 'uygulama',
      text: `Son bir saatte ${app.failedJobsLastHour} zamanlanmış iş düştü — eşik yok, bir tur bile haberdir.`,
    },
    'cert-crit': {
      tag: 'sertifika',
      text: `HTTPS sertifikası ${services.certDaysLeft} gün sonra doluyor (eşik ${T.certCritDays} gün). Sessizce dolan bir sertifika siteyi bir sabah kapatır.`,
    },
    'cert-warn': {
      tag: 'sertifika',
      text: `HTTPS sertifikası ${services.certDaysLeft} gün sonra doluyor — yenileme penceresi açıldı (eşik ${T.certWarnDays} gün).`,
    },
    'cert-unknown': { tag: 'ölçülemedi', text: 'Sertifikanın kalan ömrü okunamadı — sıfır değil, bilinmiyor.' },
    reboot: {
      tag: 'yeniden başlatma',
      text: `Çalışma süresi ${uptimeLabel(s.uptimeSec)}: sunucu yakın zamanda açılmış. Planlı bir dağıtım değilse beklenmeyen bir yeniden başlatmadır.`,
    },
  };

  return signals.map((sig) => {
    const m = METIN[sig.code];
    return {
      code: sig.code,
      tone: OLCUM_BOSLUGU.has(sig.code) ? 'unknown' : sig.level === 'crit' ? 'crit' : 'warn',
      tag: m?.tag ?? 'sistem',
      // Karşılığı yazılmamış bir sinyal SESSİZ GEÇMEZ: kodu yazılır, çünkü motor bir şey gördü ve
      // ekranın onu yutması, alarmın yerini tutan bir ekranda kabul edilemez bir sessizliktir.
      text: m?.text ?? `Tanımsız sinyal: ${sig.code}`,
    };
  });
}

/** Gerekçe yokken yazılan sakin özet — "her şey iyi" hâli de bir cümle hak eder, boş bir kutu değil. */
export function calmSummary(metrics: SystemHealthMetrics): string {
  const { system: s, processes, services } = metrics;
  const parcalar = [
    s.diskUsedPct === null ? 'disk bilinmiyor' : `disk ${yuzde(s.diskUsedPct, 0)}`,
    `kullanılabilir bellek ${yuzde(Math.round((s.memAvailableMb / Math.max(1, s.memTotalMb)) * 100))}`,
    `yük çekirdek başına ${yuzde(loadCapacityPercent(s.loadAvg[0], s.cpuCount))}`,
    s.swapUsedMb > 0 ? `swap ${mb(s.swapUsedMb)}` : 'swap kullanılmıyor',
    processes.pm2 === null ? 'süreçler bilinmiyor' : `${processes.pm2.length} süreç online`,
    services.certDaysLeft === null ? 'sertifika bilinmiyor' : `sertifika ${services.certDaysLeft} gün`,
  ];
  return `Tüm eşikler altında: ${parcalar.join(' · ')}.`;
}
