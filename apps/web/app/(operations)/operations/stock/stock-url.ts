// Stok ekranının URL SÖZLEŞMESİ — tek kaynak (ürünler ekranının deseni). Sekme ve süzgeçler adreste
// taşınır: yenilemede aynı görünüm açılır ve SUNUCU okuyabildiği için süzme sunucuda yapılır.
//
// İmleç adrese YAZILMAZ (CLAUDE.md §1): paylaşılan link listenin ortasından başlamamalı.

// Yol sabiti dışa VERİLMEZ: teklif eylemi `lib/stock/offer-actions`'a taşınınca tek tüketicisi
// kalmadı; adres burada, `stockUrl()` içinde yaşıyor.
const STOCK_PATH = '/operations/stock';

export const STOCK_TABS = ['levels', 'attention', 'losses'] as const;
export type StockTab = (typeof STOCK_TABS)[number];

/**
 * Parti süzgeci — "hangi partiler görünsün".
 *  · `all`     → hepsi
 *  · `expiry`  → karar bekleyenler (yaklaşan tarihli · DDM geçmiş · imhalık)
 *  · `offer`   → teklifi açık olanlar
 *
 * ("eşik altı" bir süre dördüncü çip olarak duruyordu — tasarımda yok, kaldırıldı. Satırda `belowMin`
 * göstergesi yerinde: bilgi kayboldu değil, süzgeç olmaktan çıktı.)
 *
 * Süzgeç PARTİ üstünden tanımlı ama SATIR süzer: bir boyun partilerinden biri ölçüte uyuyorsa satır
 * kalır. "Yaklaşan tarihli üründe başka sağlam parti de var" bilgisi karar için gereklidir; satırı
 * yalnız uyan partiyle göstermek, elde duran sağlam malı gizlerdi.
 */
export const STOCK_SCOPES = ['all', 'expiry', 'offer'] as const;
export type StockScope = (typeof STOCK_SCOPES)[number];

/**
 * İmha geçmişinin DÖNEMİ. Hareket kaydı zamanla sınırsız büyür; "ne kadar çöpe gitti" sorusunun
 * cevabı ancak bir dönemle anlamlıdır. Varsayılan çeyrek: aylık dalgalanmayı yutacak kadar geniş,
 * mevsim değişimini gizlemeyecek kadar dar.
 *
 * `all` iki ucu da açık bırakır ve toplam okuması geçmişle büyür — bilinçli bir seçenek, varsayılan değil.
 */
export const LOSS_PERIODS = ['month', 'days30', 'quarter', 'all'] as const;
export type LossPeriod = (typeof LOSS_PERIODS)[number];

export interface StockUrlState {
  tab: StockTab;
  /** Ürün/boy araması (boş = yok). */
  q: string;
  /** Kategori id'si ya da 'all'. */
  cat: string;
  scope: StockScope;
  period: LossPeriod;
}

const DEFAULTS: StockUrlState = { tab: 'levels', q: '', cat: 'all', scope: 'all', period: 'quarter' };

type RawParams = Record<string, string | string[] | undefined>;
const one = (raw: string | string[] | undefined): string => (Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? ''));

/** URL → ekran durumu. Tanınmayan değer sessizce varsayılana düşer (bozuk link ekranı kırmaz). */
export function parseStockUrl(params: RawParams): StockUrlState {
  const tabRaw = one(params.tab);
  const scopeRaw = one(params.scope);
  return {
    tab: STOCK_TABS.find((t) => t === tabRaw) ?? DEFAULTS.tab,
    q: one(params.q).trim(),
    cat: one(params.cat) || DEFAULTS.cat,
    scope: STOCK_SCOPES.find((s) => s === scopeRaw) ?? DEFAULTS.scope,
    period: LOSS_PERIODS.find((p) => p === one(params.period)) ?? DEFAULTS.period,
  };
}

/** Ekran durumu → URL. Varsayılanlar YAZILMAZ (temiz adres); sıra sabit (aynı görünüm = aynı adres). */
export function stockUrl(state: StockUrlState): string {
  const p = new URLSearchParams();
  if (state.tab !== DEFAULTS.tab) p.set('tab', state.tab);
  if (state.q) p.set('q', state.q);
  if (state.cat !== DEFAULTS.cat) p.set('cat', state.cat);
  if (state.scope !== DEFAULTS.scope) p.set('scope', state.scope);
  if (state.period !== DEFAULTS.period) p.set('period', state.period);
  const qs = p.toString();
  return qs ? `${STOCK_PATH}?${qs}` : STOCK_PATH;
}

/**
 * SERVİS süzgeçleri — yalnız sunucunun uygulayabileceği olanlar. `scope` burada YOK ve bu bilinçli:
 * "yaklaşan tarihli" bir raf ömrü KARARIDIR (motorun işi), veritabanı süzgeci değil. Ölçütü SQL'e
 * kopyalamak, eşiği iki yerde tutmak demekti — biri değişince ekran ile sayaç ayrışırdı.
 */
export function toStockFilters(state: StockUrlState): { categoryId?: string } {
  // `q` BURADA YOK ve bu bilinçli: arama kutusu yalnız imha sekmesinde var ve orada yüklenmiş
  // satırlarda çalışıyor. Terimi ürün sorgusuna vermek, kutuya yazılan kelimenin görünmeyen bir
  // listeyi (stok seviyeleri) süzmesi demekti.
  return {
    categoryId: state.cat === 'all' ? undefined : state.cat,
  };
}

/**
 * Dönemin başlangıcı — `undefined` sınırsız ("Tümü"). Sunucuda hesaplanır ki liste ile toplam AYNI
 * aralığı görsün; iki yerde hesaplansaydı gece yarısını geçen bir istekte tablo ile toplam ayrışırdı.
 */
export function periodStart(period: LossPeriod, now: Date): Date | undefined {
  if (period === 'all') return undefined;
  if (period === 'days30') return new Date(now.getTime() - 30 * 86_400_000);
  if (period === 'month') return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1));
}

/** Dönemin operatöre görünen adı — toplamın yanında "neyin toplamı" yazsın diye. */
export const PERIOD_LABEL: Record<LossPeriod, string> = {
  month: 'Bu ay',
  days30: '30 gün',
  quarter: 'Bu çeyrek',
  all: 'Tümü',
};
