import 'server-only';
import {
  HEALTH_THRESHOLDS as T,
  healthSignals,
  healthStatusOf,
  loadCapacityPercent,
} from '@lezzet/domain-core';
import type { ErrorLog, HealthTrendPoint, SystemHealthSnapshot } from '@lezzet/types';
import { calmSummary, reasonViews, uptimeLabel } from './system-reasons';
import { WINDOW_LABEL, WINDOW_MINUTES, type TrendWindow } from './system-url';
import type {
  AppCounterView,
  ErrorRowView,
  HealthView,
  MetricRowView,
  MetricTone,
  ProcessRowView,
  ServiceCardView,
  TrendChartView,
  VerdictTone,
} from './system-types';

/**
 * Sistem ekranının SUNUCU türetimi (18.5) — ham satırdan görünüme.
 *
 * Burada iş kuralı YOK: hüküm ve gerekçe motordan (`healthStatusOf` / `healthSignals`), eşikler
 * `HEALTH_THRESHOLDS`'tan geliyor. Bu dosyanın işi biçim — sayıyı okunur yapmak, eğriyi çizmek,
 * satırı ekranın istediği şekle sokmak (STACK §4: birleştiren yer uygulama katmanıdır).
 */

const mbGb = (v: number): string => `${(v / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} GB`;
const say = (v: number, basamak = 0): string => v.toLocaleString('tr-TR', { maximumFractionDigits: basamak, minimumFractionDigits: basamak });
const yuzde = (v: number, basamak = 0): string => `%${say(v, basamak)}`;

/** Ölçümün yaşı — dakika. Damga geçersizse `null`: uydurma bir yaş, bayatlığı gizlerdi. */
export function ageMinutesOf(iso: string, now: number): number | null {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.max(0, (now - t) / 60_000);
}

const VERDICT_TITLE: Record<VerdictTone, string> = {
  ok: 'İyi',
  warn: 'Uyarı',
  crit: 'Kritik',
  stale: 'İzleme durdu',
};

/**
 * Anlık görüntü → hüküm şeridi + dört panel.
 *
 * `stale` ayrı bir TON ama ayrı bir hüküm değil: motor onu zaten `crit` sayıyor (izlemenin durduğu
 * hâl, izlemenin en tehlikeli hâlidir). Ekranın ayırmasının sebebi başka — "kritik" ile "aşağıdaki
 * değerlere güvenme" farklı iki cümledir ve ikincisi söylenmezse operatör bayat sayıları canlı sanır.
 */
export function toHealthView(snapshot: SystemHealthSnapshot | null, now: number): HealthView | null {
  if (!snapshot) return null;
  const metrics = snapshot.metrics;
  const age = ageMinutesOf(snapshot.createdAt, now) ?? 0;
  const stale = age >= T.staleCritMinutes;
  // Hüküm KAYITTAN değil ŞU ANDAN hesaplanır: satırdaki `status` yazıldığı andaki hükümdür ve
  // bayatlığı bilemez — toplama durduğunda tablodaki son satır hâlâ "ok" der.
  const status = healthStatusOf(metrics, age);
  const signals = healthSignals(metrics, age);
  const reasons = reasonViews(metrics, signals, age);

  return {
    status,
    tone: stale ? 'stale' : status === 'crit' ? 'crit' : status === 'warn' ? 'warn' : 'ok',
    title: VERDICT_TITLE[stale ? 'stale' : status === 'crit' ? 'crit' : status === 'warn' ? 'warn' : 'ok'],
    ageMinutes: age,
    stale,
    reasons,
    summary: reasons.length === 0 ? calmSummary(metrics) : '',
    serverRows: serverRows(metrics),
    mobileRows: mobileRows(metrics),
    processes: processRows(metrics),
    services: serviceCards(metrics),
    appCounters: appCounters(metrics),
  };
}

/** Eşik karşılaştırması → çubuk tonu. Tek yerde: her satır aynı sözlüğü kullansın. */
const tone = (crit: boolean, warn: boolean): MetricTone => (crit ? 'crit' : warn ? 'warn' : 'ok');

function serverRows(m: SystemHealthMetrics): MetricRowView[] {
  const s = m.system;
  const loadPct = loadCapacityPercent(s.loadAvg[0], s.cpuCount);
  const availPct = Math.round((s.memAvailableMb / Math.max(1, s.memTotalMb)) * 100);
  const usedPct = 100 - availPct;
  const swapVar = s.swapUsedMb > 0;
  const swapPct = s.swapTotalMb > 0 ? Math.round((s.swapUsedMb / s.swapTotalMb) * 100) : 0;
  const taze = s.uptimeSec < T.rebootNoticeSec;

  const yuk: MetricRowView = {
    key: 'load',
    label: 'Yük (1/5/15)',
    value: s.loadAvg.map((x) => say(x, 2)).join(' · '),
    tone: tone(loadPct >= 150, loadPct > 100),
    // Çubuk 1 DAKİKA yükünü gösterir, 5 değil: hüküm de ona bakıyor (`healthSignals`). Tasarımın
    // taslağı 5 dakikayı çiziyordu — ekranın çubuğu ile bandın hükmü aynı sayıya bakmalı, yoksa
    // "eşik aşıldı" diyen bant, eşiği aşmamış görünen bir çubuğun üstünde durur.
    barPct: Math.min(100, loadPct),
    threshold: 'eşik: %100 / çekirdek',
    note: `${s.cpuCount} çekirdeğe oranla ${yuzde(loadPct)} — ham sayı tek başına bilgi değil.`,
    tag: null,
    unknown: false,
    highlight: false,
  };

  const bellek: MetricRowView = {
    key: 'mem',
    label: 'Bellek',
    value: `${mbGb(s.memAvailableMb)} kullanılabilir / ${mbGb(s.memTotalMb)}`,
    tone: tone(s.memAvailableMb < T.memCritAvailableMb, s.memAvailableMb < T.memWarnAvailableMb),
    barPct: usedPct,
    threshold: `eşik: kullanılabilir < ${T.memWarnAvailableMb} MB`,
    note: `Kullanılan ${mbGb(s.memUsedMb)} · "kullanılabilir" ile "boş" aynı şey değil; eşik kullanılabilire bakar.`,
    tag: null,
    unknown: false,
    highlight: false,
  };

  const swap: MetricRowView = swapVar
    ? {
        key: 'swap',
        label: 'Swap',
        value: `${say(s.swapUsedMb)} MB / ${mbGb(s.swapTotalMb)} kullanımda`,
        // Swap'ın KULLANILIYOR olması başlı başına haber (tasarım: kendi amber zemini) — eşik
        // aşılmasa da satır dikkat çeker. Hükmü DEĞİŞTİRMEZ: hüküm `healthSignals`'tan gelir ve
        // orada eşik %50. Satırın rengi bir uyarı değil, bir işarettir: "sunucu takasa düştü".
        tone: 'warn',
        barPct: swapPct,
        threshold: `eşik: ${yuzde(T.swapWarnRatio * 100)}`,
        note: "Ayrı bir haber: swap'a düşmüş sunucu çalışır ama yavaşlamıştır.",
        tag: "swap'ta",
        unknown: false,
        highlight: true,
      }
    : {
        key: 'swap',
        label: 'Swap',
        value: `0 MB / ${mbGb(s.swapTotalMb)}`,
        tone: 'ok',
        barPct: null,
        threshold: null,
        note: 'Takas kullanılmıyor.',
        tag: null,
        unknown: false,
        highlight: false,
      };

  const disk: MetricRowView =
    s.diskUsedPct === null
      ? {
          key: 'disk',
          label: 'Disk',
          value: 'bilinmiyor',
          tone: 'warn',
          barPct: null,
          threshold: null,
          // Boş çubuk KESİKLİ çizilir ve sıfır dolgusu yoktur: "%0 dolu" demek, bozuk bir ölçümü
          // sağlıklı bir disk gibi okutmaktır (CLAUDE.md §1'in kırmızı çizgisi).
          note: 'Ölçüm alınamadı. Sıfır çizilmez — bilinmemek bir ölçüm değildir.',
          tag: 'ölçülemedi',
          unknown: true,
          highlight: true,
        }
      : {
          key: 'disk',
          label: 'Disk',
          value: `${say(s.diskUsedGb ?? 0, 1)} / ${say(s.diskTotalGb ?? 0, 1)} GB · ${yuzde(s.diskUsedPct, 1)}`,
          tone: tone(s.diskUsedPct >= T.diskCritPct, s.diskUsedPct >= T.diskWarnPct),
          barPct: s.diskUsedPct,
          threshold: `eşik: ${yuzde(T.diskWarnPct)}`,
          note: null,
          tag: null,
          unknown: false,
          highlight: s.diskUsedPct >= T.diskWarnPct,
        };

  const calisma: MetricRowView = {
    key: 'uptime',
    label: 'Çalışma süresi',
    value: uptimeLabel(s.uptimeSec),
    tone: taze ? 'warn' : 'ok',
    barPct: null,
    threshold: null,
    note: taze ? `Sunucu ${uptimeLabel(s.uptimeSec)} önce açıldı — planlı bir dağıtım değilse beklenmeyen.` : null,
    tag: taze ? 'yeniden başladı' : null,
    unknown: false,
    highlight: taze,
  };

  return [yuk, bellek, swap, disk, calisma];
}

function mobileRows(m: SystemHealthMetrics): HealthView['mobileRows'] {
  const s = m.system;
  const pm2 = m.processes.pm2;
  const loadPct = loadCapacityPercent(s.loadAvg[0], s.cpuCount);
  const dusen = pm2?.filter((p) => p.status !== 'online').length ?? 0;
  return [
    {
      key: 'disk',
      label: 'Disk',
      value: s.diskUsedPct === null ? 'bilinmiyor' : yuzde(s.diskUsedPct),
      tone: s.diskUsedPct === null ? 'warn' : tone(s.diskUsedPct >= T.diskCritPct, s.diskUsedPct >= T.diskWarnPct),
    },
    {
      key: 'mem',
      label: 'Kullanılabilir bellek',
      value: mbGb(s.memAvailableMb),
      tone: tone(s.memAvailableMb < T.memCritAvailableMb, s.memAvailableMb < T.memWarnAvailableMb),
    },
    { key: 'load', label: 'Yük · çekirdek başına', value: yuzde(loadPct), tone: tone(loadPct >= 150, loadPct > 100) },
    {
      key: 'proc',
      label: 'Süreçler',
      // `null` "bilinmiyor" der, "0 süreç" DEMEZ: sıfır göstermek, okunamayan bir süreç listesini
      // boş bir sunucu gibi okutur.
      value: pm2 === null ? 'bilinmiyor' : dusen > 0 ? `${dusen} sorunlu` : `${pm2.length} online`,
      tone: pm2 === null ? 'warn' : dusen > 0 ? 'crit' : 'ok',
    },
  ];
}

function processRows(m: SystemHealthMetrics): ProcessRowView[] | null {
  if (m.processes.pm2 === null) return null;
  return m.processes.pm2.map((p) => ({
    name: p.name,
    status: p.status,
    down: p.status !== 'online',
    restarts: p.restarts,
    restartsNotable: p.restarts >= T.restartsNoticeCount,
    memory: p.memoryMb > 0 ? `${say(p.memoryMb)} MB` : '—',
    cpu: `${say(p.cpuPct, 1)}%`,
  }));
}

function serviceCards(m: SystemHealthMetrics): ServiceCardView[] {
  const { webUp, caddyActive, certDaysLeft } = m.services;
  return [
    webUp
      ? { key: 'web', label: 'Web', value: 'ayakta', sub: 'Sunucunun içinden yapılan denetim yanıt verdi.', tone: 'ok' }
      : { key: 'web', label: 'Web', value: 'yanıt yok', sub: 'İç denetim başarısız — istek karşılanmıyor.', tone: 'crit' },
    // ÜÇ HÂL: `null` "soramadık"tır ve "kapalı" ile aynı kutuya konmaz. İkisini birleştirmek,
    // systemd'siz her makinede siteyi çökmüş göstermek olurdu (01.08 düzeltmesi).
    caddyActive === null
      ? { key: 'caddy', label: 'Caddy', value: 'bilinmiyor', sub: 'Durum sorulamadı (systemd yok) — kapalı demek değil.', tone: 'warn' }
      : caddyActive
        ? { key: 'caddy', label: 'Caddy', value: 'çalışıyor', sub: 'Ters vekil ayakta.', tone: 'ok' }
        : { key: 'caddy', label: 'Caddy', value: 'kapalı', sub: 'Ters vekil düştü: süreçler "online" görünse de site erişilemez.', tone: 'crit' },
    certDaysLeft === null
      ? { key: 'cert', label: 'Sertifika', value: 'bilinmiyor', sub: 'Kalan gün okunamadı — sıfır değil.', tone: 'warn' }
      : certDaysLeft < T.certCritDays
        ? { key: 'cert', label: 'Sertifika', value: `${certDaysLeft} gün`, sub: `Dolmasına çok az kaldı (eşik ${T.certCritDays} gün).`, tone: 'crit' }
        : certDaysLeft < T.certWarnDays
          ? { key: 'cert', label: 'Sertifika', value: `${certDaysLeft} gün`, sub: `Yenileme penceresi açıldı (eşik ${T.certWarnDays} gün).`, tone: 'warn' }
          : { key: 'cert', label: 'Sertifika', value: `${certDaysLeft} gün`, sub: 'Otomatik yenileme çalışıyor.', tone: 'neutral' },
  ];
}

function appCounters(m: SystemHealthMetrics): AppCounterView[] {
  const { errorLogsLastHour, failedJobsLastHour } = m.app;
  return [
    {
      key: 'errors',
      label: 'Hata kaydı',
      value: errorLogsLastHour,
      // Renk sınırı MOTORUN eşiğinden: ekran kendi eşiğini uydurursa "sakin görünen sayı" ile
      // "uyarı veren bant" aynı ekranda çelişir.
      tone: tone(errorLogsLastHour > T.errorsWarnPerHour * 2, errorLogsLastHour > T.errorsWarnPerHour),
    },
    { key: 'jobs', label: 'Başarısız iş', value: failedJobsLastHour, tone: tone(failedJobsLastHour > 5, failedJobsLastHour > 0) },
  ];
}

// ── Trend (O22) ──────────────────────────────────────────────────────────────────────────────────

/** Çizim alanı — tasarımın viewBox'ı. Tavan 100, taban 0: yüzde metrikleri TAM ÖLÇEKTE çizilir. */
const VB_W = 300;
const VB_H = 72;
/** Hedef nokta sayısı. Ham veri (7 günde ~5.000 satır) bu sayıya indirgenir — 300px'e 46 nokta yeter. */
const NOKTA = 46;

interface Seri {
  key: string;
  title: string;
  /** Kovaların ortalaması; ölçüm olmayan kova `null` kalır ve eğri ORADA KIRILIR. */
  values: (number | null)[];
  thresholdPct: number | null;
  thresholdLabel: string | null;
  format: (v: number) => string;
}

/**
 * Ham noktaları `NOKTA` kovaya indirger. Kova ortalaması alınır; kovanın TAMAMI ölçümsüzse `null`
 * kalır — sıfıra düşürülmez, çünkü eğri o aralıkta yere inip "disk boşaldı" derdi.
 */
function kovala(points: readonly HealthTrendPoint[], oku: (p: HealthTrendPoint) => number | null): (number | null)[] {
  if (points.length === 0) return [];
  const kova = Math.max(1, Math.ceil(points.length / NOKTA));
  const out: (number | null)[] = [];
  for (let i = 0; i < points.length; i += kova) {
    const dilim = points.slice(i, i + kova).map(oku).filter((v): v is number => v !== null);
    out.push(dilim.length ? dilim.reduce((a, b) => a + b, 0) / dilim.length : null);
  }
  return out;
}

/** Değerleri SVG yoluna çevirir. Boşluklar `M` ile yeniden başlatılır: kırık eğri, uydurma çizgiden iyidir. */
function yol(values: readonly (number | null)[]): { line: string; area: string } {
  if (values.length < 2) return { line: '', area: '' };
  const X = (i: number) => ((i / (values.length - 1)) * VB_W).toFixed(1);
  const Y = (v: number) => (VB_H - (Math.max(0, Math.min(100, v)) / 100) * VB_H).toFixed(1);

  const line: string[] = [];
  const area: string[] = [];
  let acik = false;
  values.forEach((v, i) => {
    if (v === null) {
      if (acik) area.push(`L${X(i - 1)},${VB_H} Z`);
      acik = false;
      return;
    }
    line.push(`${acik ? 'L' : 'M'}${X(i)},${Y(v)}`);
    if (!acik) area.push(`M${X(i)},${VB_H} L${X(i)},${Y(v)}`);
    else area.push(`L${X(i)},${Y(v)}`);
    acik = true;
  });
  if (acik) area.push(`L${X(values.length - 1)},${VB_H} Z`);
  return { line: line.join(' '), area: area.join(' ') };
}

function toChart(seri: Seri, winLabel: string): TrendChartView {
  const dolu = seri.values.filter((v): v is number => v !== null);
  const ilk = dolu[0];
  const son = dolu[dolu.length - 1];
  const { line, area } = yol(seri.values);

  if (ilk === undefined || son === undefined) {
    return {
      key: seri.key,
      title: seri.title,
      now: 'bilinmiyor',
      line: '',
      area: '',
      thresholdY: null,
      thresholdLabel: null,
      caption: 'Ölçüm alınamadı — çizilecek değer yok. Boş grafik "sıfır" demek değil.',
      hot: false,
    };
  }

  const fark = son - ilk;
  const yon = Math.abs(fark) < 1.2 ? 'yatay' : fark > 0 ? 'yükseliyor' : 'düşüyor';
  const puan = Math.abs(fark) >= 1.2 ? ` (${fark > 0 ? '+' : '−'}${say(Math.abs(fark), 1)} puan)` : '';
  const thr = seri.thresholdPct;

  return {
    key: seri.key,
    title: seri.title,
    now: seri.format(son),
    line,
    area,
    // Eşik tavana ya da tabana yapışıyorsa çizilmez: kenardaki bir çizgi grafiğin çerçevesi sanılır.
    thresholdY: thr !== null && thr > 2 && thr < 98 ? VB_H - (thr / 100) * VB_H : null,
    thresholdLabel: seri.thresholdLabel,
    caption: `${winLabel}: ${seri.format(ilk)} → ${seri.format(son)} · ${yon}${puan}`,
    hot: thr !== null && son >= thr,
  };
}

/**
 * Üç eğri: disk · bellek · yük. Fazlası **kurulmaz** — bu bir APM panosu değil; her eklenen kutu
 * asıl haberi seyreltir (`design/pages/admin-sistem.md §6`).
 *
 * Yüzdeler TAM ÖLÇEKTE (tavan 100) çizilir: otomatik ölçek, bir haftadır %53'te duran bir diski
 * dramatik dalgalanma gibi gösterirdi. Yük tavanı aşabilir; eğri kırpılır ama **başlıktaki sayı
 * gerçeği söyler** — çizim sınırı, ölçünün sınırı değildir.
 */
export function toTrendCharts(points: readonly HealthTrendPoint[], win: TrendWindow): { charts: TrendChartView[]; empty: boolean } {
  const winLabel = WINDOW_LABEL[win];
  if (points.length < 2) return { charts: [], empty: true };

  // Bellek eşiği MUTLAK (kullanılabilir < 500 MB), yüzde değil — grafiğe çizmek için toplam bellekle
  // orana çevriliyor. Tasarımın taslağı sabit %85 yazıyordu; bizim modelimizde öyle bir eşik yok ve
  // uydurulmuş bir çizgi, operatöre var olmayan bir kural öğretirdi.
  const memTotal = points.map((p) => p.memTotal).find((v): v is number => v !== null && v > 0) ?? null;
  const memThreshold = memTotal ? 100 - (T.memWarnAvailableMb / memTotal) * 100 : null;

  const seriler: Seri[] = [
    {
      key: 'disk',
      title: 'Disk doluluğu',
      values: kovala(points, (p) => p.disk),
      thresholdPct: T.diskWarnPct,
      thresholdLabel: `eşik ${yuzde(T.diskWarnPct)}`,
      format: (v) => yuzde(v, 1),
    },
    {
      key: 'mem',
      title: 'Bellek kullanımı',
      values: kovala(points, (p) => (p.memUsed !== null && p.memTotal ? (p.memUsed / p.memTotal) * 100 : null)),
      thresholdPct: memThreshold,
      thresholdLabel: memThreshold === null ? null : `eşik: kullanılabilir ${T.memWarnAvailableMb} MB`,
      format: (v) => yuzde(v),
    },
    {
      key: 'load',
      title: 'Yük · çekirdek başına',
      values: kovala(points, (p) => (p.load1 !== null && p.cores ? loadCapacityPercent(p.load1, p.cores) : null)),
      thresholdPct: 100,
      thresholdLabel: 'eşik %100',
      format: (v) => yuzde(v),
    },
  ];

  return { charts: seriler.map((s) => toChart(s, winLabel)), empty: false };
}

/** Trend penceresinin kesme noktası — sorgunun `gte` sınırı. */
export function windowCutoff(win: TrendWindow, now: number): string {
  return new Date(now - WINDOW_MINUTES[win] * 60_000).toISOString();
}

// ── Hata satırları (O23) ─────────────────────────────────────────────────────────────────────────

/**
 * Kayıt satırlarını ekranın istediği şekle sokar.
 *
 * İki alan `error_log`'da YOK ve olmamalı: `resolvedByName` başka tablonun malıdır (satıra
 * kopyalansaydı personel adı değişince geçmiş yalan söylerdi), `regression` ise bir sorgunun
 * cevabıdır — aynı parmak izinin daha önce kapatılmış satırı var mı? İkisini burada birleştiriyoruz
 * çünkü birleştiren yer uygulama katmanıdır (STACK §4).
 */
export function toErrorRows(
  rows: readonly ErrorLog[],
  resolvedHistory: readonly ErrorLog[],
  names: ReadonlyMap<string, string>,
): ErrorRowView[] {
  // Parmak izi → EN SON kapanış. Liste `resolvedAt desc` geldiği için ilk eşleşme en yenisidir.
  const gecmis = new Map<string, ErrorLog>();
  for (const r of resolvedHistory) if (!gecmis.has(r.fingerprint)) gecmis.set(r.fingerprint, r);

  return rows.map((r) => {
    // Kendi satırı geçmişi değildir: kapalı bir satır kendi kendinin regresyonu olamaz.
    const onceki = gecmis.get(r.fingerprint);
    const regression =
      !r.resolvedAt && onceki && onceki.id !== r.id && onceki.resolvedAt
        ? { resolvedAt: onceki.resolvedAt, byName: onceki.resolvedBy ? (names.get(onceki.resolvedBy) ?? null) : null }
        : null;

    return {
      id: r.id,
      level: r.level,
      source: r.source,
      message: r.message,
      stack: r.stack,
      context: r.context,
      path: r.path,
      count: r.count,
      firstSeenAt: r.firstSeenAt,
      lastSeenAt: r.lastSeenAt,
      resolvedAt: r.resolvedAt,
      resolvedByName: r.resolvedBy ? (names.get(r.resolvedBy) ?? null) : null,
      regression,
    };
  });
}

// Tip yalnız bu dosyada kullanılıyor; şemadan türer, elle yazılmaz.
type SystemHealthMetrics = SystemHealthSnapshot['metrics'];
