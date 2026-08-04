import { one, oneOf, type RawParams } from '@/lib/url-params';

// Raporlar ekranının URL SÖZLEŞMESİ. Sekme ve dönem adreste taşınır: "temmuzun şirket kârı"
// bağlantısı paylaşılabilir olmalı — bir rapor bulgusunu göstermenin tek yolu budur. İmleç adrese
// YAZILMAZ (CLAUDE.md §1); zaten bu ekranda sayfalanan tek küme fatura kuyruğu.

export const REPORTS_PATH = '/operations/reports';

/**
 * Dört sekme — tasarımın kendi ayrımı.
 *
 * **`urun` ile `sirket` ayrı sekmeler ve bu bir yerleşim tercihi değil, §6'nın yasağı:** *"iki kâr
 * kavramı tek rakama indirgenerek karıştırılmaz — 'ürün kârı' genel gider içermez, 'şirket kârı'
 * içerir; ikisi aynı tabloda tek sütun olmaz"*. Aynı ekranda yan yana iki sütun olsalardı okuyan
 * kişi ikisini karşılaştırır ve farkı bir hata sanardı.
 */
export const REPORT_TABS = ['urun', 'sirket', 'kanal', 'export'] as const;
export type ReportTab = (typeof REPORT_TABS)[number];

export interface ReportsUrlState {
  tab: ReportTab;
  /** `YYYY-MM` — raporun ayı. Dönem AY tabanlı, çünkü muhasebe ayla konuşur. */
  ym: string;
  /** "↳ geçen aya göre" — karşılaştırma açık mı. */
  cmp: boolean;
}

/** Geçerli bir `YYYY-MM` mi. Bozuk değer sessizce bu aya düşer (bozuk bağlantı ekranı kırmaz). */
function isMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Bir tarihin ayı — `now` DIŞARIDAN gelir (saf kalsın + hidrasyon uyuşmazlığı doğmasın). */
export function monthOf(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export function parseReportsUrl(params: RawParams, now: Date): ReportsUrlState {
  const ym = one(params.ym).trim();
  return {
    tab: oneOf(params.tab, REPORT_TABS, 'urun'),
    ym: isMonth(ym) ? ym : monthOf(now),
    cmp: one(params.cmp) === '1',
  };
}

/** Ekran durumu → URL. Bu ayın raporu varsayılandır, adrese yazılmaz (temiz adres). */
export function reportsUrl(state: ReportsUrlState, now: Date): string {
  const p = new URLSearchParams();
  if (state.tab !== 'urun') p.set('tab', state.tab);
  if (state.ym !== monthOf(now)) p.set('ym', state.ym);
  if (state.cmp) p.set('cmp', '1');
  const qs = p.toString();
  return qs ? `${REPORTS_PATH}?${qs}` : REPORTS_PATH;
}

/**
 * Ayın ilk ve son günü (`YYYY-MM-DD`).
 *
 * Son gün **bir sonraki ayın sıfırıncı günü** olarak bulunuyor: `new Date(y, m, 0)` ayın uzunluğunu
 * takvimden okur. Elle 28/30/31 yazmak şubatta ve artık yılda yanılır — ve o yanılma sessizdir,
 * yalnız o ayın son gününde kesilmiş bir ciro olarak görünür.
 */
export function monthRange(ym: string): { from: string; to: string } {
  const [year, month] = ym.split('-').map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(lastDay).padStart(2, '0')}` };
}

/** Bir önceki ay — karşılaştırmanın ve "geçen ay" kısayolunun ortak kaynağı. */
export function previousMonth(ym: string): string {
  const [year, month] = ym.split('-').map(Number) as [number, number];
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
}

const MONTH_NAMES = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
] as const;

/** "Temmuz 2026" — tasarımın başlıktaki yazımı. */
export function monthLabel(ym: string): string {
  const [year, month] = ym.split('-').map(Number) as [number, number];
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/**
 * Seçilebilir aylar — bu aydan geriye doğru bir yıl.
 *
 * İleri gitmek YOK: gelecek ayın raporu boş çıkar ve boş bir rapor, veri olmadığını değil işin
 * kötü gittiğini düşündürür. Geriye bir yıl, "geçen yılın aynı ayı" karşılaştırmasını da
 * kapsayacak en dar penceredir.
 */
export function selectableMonths(now: Date, count = 13): string[] {
  const months: string[] = [];
  let ym = monthOf(now);
  for (let index = 0; index < count; index += 1) {
    months.push(ym);
    ym = previousMonth(ym);
  }
  return months;
}
