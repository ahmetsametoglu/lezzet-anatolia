// Stok ekranının URL SÖZLEŞMESİ — tek kaynak (ürünler ekranının deseni). Sekme ve süzgeçler adreste
// taşınır: yenilemede aynı görünüm açılır ve SUNUCU okuyabildiği için süzme sunucuda yapılır.
//
// İmleç adrese YAZILMAZ (CLAUDE.md §1): paylaşılan link listenin ortasından başlamamalı.

export const STOCK_PATH = '/operations/stock';

export const STOCK_TABS = ['levels', 'attention', 'losses'] as const;
export type StockTab = (typeof STOCK_TABS)[number];

/**
 * Parti süzgeci — "hangi partiler görünsün".
 *  · `all`     → hepsi
 *  · `expiry`  → karar bekleyenler (yaklaşan tarihli · DDM geçmiş · imhalık)
 *  · `offer`   → teklifi açık olanlar
 *  · `low`     → kullanılabilir stoğu eşiğin altına düşmüş boylar
 *
 * Süzgeç PARTİ üstünden tanımlı ama SATIR süzer: bir boyun partilerinden biri ölçüte uyuyorsa satır
 * kalır. "Yaklaşan tarihli üründe başka sağlam parti de var" bilgisi karar için gereklidir; satırı
 * yalnız uyan partiyle göstermek, elde duran sağlam malı gizlerdi.
 */
export const STOCK_SCOPES = ['all', 'expiry', 'offer', 'low'] as const;
export type StockScope = (typeof STOCK_SCOPES)[number];

export interface StockUrlState {
  tab: StockTab;
  /** Ürün/boy araması (boş = yok). */
  q: string;
  /** Kategori id'si ya da 'all'. */
  cat: string;
  scope: StockScope;
}

const DEFAULTS: StockUrlState = { tab: 'levels', q: '', cat: 'all', scope: 'all' };

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
  };
}

/** Ekran durumu → URL. Varsayılanlar YAZILMAZ (temiz adres); sıra sabit (aynı görünüm = aynı adres). */
export function stockUrl(state: StockUrlState): string {
  const p = new URLSearchParams();
  if (state.tab !== DEFAULTS.tab) p.set('tab', state.tab);
  if (state.q) p.set('q', state.q);
  if (state.cat !== DEFAULTS.cat) p.set('cat', state.cat);
  if (state.scope !== DEFAULTS.scope) p.set('scope', state.scope);
  const qs = p.toString();
  return qs ? `${STOCK_PATH}?${qs}` : STOCK_PATH;
}

/**
 * SERVİS süzgeçleri — yalnız sunucunun uygulayabileceği olanlar. `scope` burada YOK ve bu bilinçli:
 * "yaklaşan tarihli" bir raf ömrü KARARIDIR (motorun işi), veritabanı süzgeci değil. Ölçütü SQL'e
 * kopyalamak, eşiği iki yerde tutmak demekti — biri değişince ekran ile sayaç ayrışırdı.
 */
export function toStockFilters(state: StockUrlState): { query?: string; categoryId?: string } {
  return {
    query: state.q || undefined,
    categoryId: state.cat === 'all' ? undefined : state.cat,
  };
}
