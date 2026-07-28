// Fiyat ekranının URL SÖZLEŞMESİ — tek kaynak (stok ve ürünler ekranlarının deseni). Sekme ve
// süzgeçler adreste taşınır: yenilemede aynı görünüm açılır ve SUNUCU okuyabildiği için süzme
// sunucuda yapılabilir.
//
// İmleç adrese YAZILMAZ (CLAUDE.md §1): paylaşılan link listenin ortasından başlamamalı.

export const PRICES_PATH = '/operations/prices';

export const PRICE_TABS = ['channels', 'customers', 'coupons', 'offers'] as const;
export type PriceTab = (typeof PRICE_TABS)[number];

/**
 * Satır süzgeci — "hangi boylar görünsün".
 *  · `all`     → hepsi
 *  · `below`   → hedef marjın altında satılanlar (uyarı kuyruğu)
 *  · `missing` → en az bir kanalda fiyatı olmayanlar (o kanalda satışa kapalı)
 *  · `auto`    → otomatik fiyatı açık ürünlerin boyları
 *
 * Üçü de SUNUCUDA süzülemez ve bu bilinçli: marj bir KARARDIR (motorun işi), fiyat eksikliği ise
 * satırın YOKLUĞUdur — ikisi de SQL süzgecine çevrilseydi ölçüt iki yerde yaşardı.
 */
export const PRICE_SCOPES = ['all', 'below', 'missing', 'auto'] as const;
export type PriceScope = (typeof PRICE_SCOPES)[number];

export interface PricesUrlState {
  tab: PriceTab;
  /** Ürün/boy araması (boş = yok). */
  q: string;
  /** Kategori id'si ya da 'all'. */
  cat: string;
  scope: PriceScope;
}

const DEFAULTS: PricesUrlState = { tab: 'channels', q: '', cat: 'all', scope: 'all' };

type RawParams = Record<string, string | string[] | undefined>;
const one = (raw: string | string[] | undefined): string => (Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? ''));

/** URL → ekran durumu. Tanınmayan değer sessizce varsayılana düşer (bozuk link ekranı kırmaz). */
export function parsePricesUrl(params: RawParams): PricesUrlState {
  const tabRaw = one(params.tab);
  const scopeRaw = one(params.scope);
  return {
    tab: PRICE_TABS.find((t) => t === tabRaw) ?? DEFAULTS.tab,
    q: one(params.q).trim(),
    cat: one(params.cat) || DEFAULTS.cat,
    scope: PRICE_SCOPES.find((s) => s === scopeRaw) ?? DEFAULTS.scope,
  };
}

/** Ekran durumu → URL. Varsayılanlar YAZILMAZ (temiz adres); sıra sabit (aynı görünüm = aynı adres). */
export function pricesUrl(state: PricesUrlState): string {
  const p = new URLSearchParams();
  if (state.tab !== DEFAULTS.tab) p.set('tab', state.tab);
  if (state.q) p.set('q', state.q);
  if (state.cat !== DEFAULTS.cat) p.set('cat', state.cat);
  if (state.scope !== DEFAULTS.scope) p.set('scope', state.scope);
  const qs = p.toString();
  return qs ? `${PRICES_PATH}?${qs}` : PRICES_PATH;
}

/** SERVİS süzgeçleri — yalnız sunucunun uygulayabileceği olanlar (`scope` motorun işi, bkz. yukarı). */
export function toPriceFilters(state: PricesUrlState): { query?: string; categoryId?: string } {
  return {
    query: state.q || undefined,
    categoryId: state.cat === 'all' ? undefined : state.cat,
  };
}

export const SCOPE_LABEL: Record<PriceScope, string> = {
  all: 'Tümü',
  below: 'Marj-altı',
  missing: 'Fiyatı eksik',
  // Kolon adı (`auto_price`) ekrana YAZILMAZ: operatörün gördüğü şey veritabanı alanı değil,
  // ürünün davranışıdır. Süzgeç zaten "açık olanlar" demek — sıfat da gereksiz.
  auto: 'Otomatik fiyatlandırma',
};

export const TAB_LABEL: Record<PriceTab, string> = {
  channels: 'Kanal fiyatları',
  customers: 'Müşteriye özel',
  coupons: 'Kupon & kampanya',
  // Tasarım bu sekmeye "Near-expiry" diyor; operasyon yüzeyi TÜRKÇEDİR ve aynı kuyruk stok
  // ekranında zaten "Yaklaşan tarihli" adıyla duruyor. İki ekranda iki ad, tek kuyruğu iki iş
  // gibi gösterirdi.
  offers: 'Yaklaşan tarihli',
};
