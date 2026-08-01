// Sistem ekranının URL durumu (18.5) — hata sekmesi · arama · sayfa · trend penceresi.
//
// Dördü de URL'de çünkü dördü de SUNUCU okumasını değiştiriyor: sekme ve arama sorguyu, sayfa
// aralığı, pencere ise trend kesme noktasını belirliyor. Client durumunda tutulsalardı ekran ya
// yüklenmiş sayfayı süzerdi (yalan) ya her değişimde tam okumayı elle tetiklerdi.
//
// **Sayfa numarası bir İMLEÇ DEĞİL** (CLAUDE.md §1'in "imleç URL'e yazılmaz" kuralı): keyset imleci
// bir satırın kimliğini taşır ve paylaşılan bir bağlantıda anlamsızdır; sayfa numarası konumdur ve
// paylaşılabilir. Bu ekranın sayfalama seçmesinin gerekçesi `system-types`'ta yazılı.

export const SYSTEM_PATH = '/operations/system';

export const ERROR_TABS = ['acik', 'cozulmus'] as const;
export type ErrorTab = (typeof ERROR_TABS)[number];

export const TREND_WINDOWS = ['m10', 'h1', 'd1', 'd7'] as const;
export type TrendWindow = (typeof TREND_WINDOWS)[number];

export const WINDOW_LABEL: Record<TrendWindow, string> = {
  m10: '10 dk',
  h1: '1 saat',
  d1: '24 saat',
  d7: '7 gün',
};

/** Pencerenin dakika karşılığı — kesme noktası ve kova genişliği bundan çıkar. */
export const WINDOW_MINUTES: Record<TrendWindow, number> = { m10: 10, h1: 60, d1: 1440, d7: 10_080 };

/**
 * Sayfa başına hata TÜRÜ. Tasarımın gösterim değeri 5'ti (dokuz örnek satırla sayfalamayı
 * göstermek için); gerçek ekranda 20 satır bir sayfayı doldurur ve operatörü gereksiz tıklamaya
 * zorlamaz. Parametrik: değişmesi gerekirse tek yer.
 */
export const ERROR_PAGE_SIZE = 20;

export interface SystemUrlState {
  tab: ErrorTab;
  q: string;
  page: number;
  win: TrendWindow;
}

type RawParams = Record<string, string | string[] | undefined>;

const tekil = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''));

export function parseSystemUrl(params: RawParams): SystemUrlState {
  const tab = ERROR_TABS.find((t) => t === tekil(params.tab)) ?? 'acik';
  const win = TREND_WINDOWS.find((w) => w === tekil(params.win)) ?? 'd1';
  // Sayfa 0'dan başlar; bozuk/negatif değer başa döner — URL elle düzenlenebilir bir yüzeydir.
  const page = Math.max(0, Number.parseInt(tekil(params.page), 10) || 0);
  return { tab, q: tekil(params.q).trim(), page, win };
}

/** Varsayılan olan alan URL'e YAZILMAZ: paylaşılan bağlantı gürültüsüz kalsın. */
export function systemUrl(state: SystemUrlState): string {
  const sp = new URLSearchParams();
  if (state.tab !== 'acik') sp.set('tab', state.tab);
  if (state.q) sp.set('q', state.q);
  if (state.page > 0) sp.set('page', String(state.page));
  if (state.win !== 'd1') sp.set('win', state.win);
  const qs = sp.toString();
  return qs ? `${SYSTEM_PATH}?${qs}` : SYSTEM_PATH;
}
