import { COUNTRY_LABELS, ProductVatRateSchema } from '@lezzet/types';

// Fiyat ekranının URL sözleşmesi: sekme ve süzgeçler adreste taşınır ki yenilemede aynı görünüm açılsın ve sunucu süzebilsin. İmleç
// adrese yazılmaz, çünkü paylaşılan bağlantı listenin ortasından başlamamalı.

export const PRICES_PATH = '/operations/prices';

export const PRICE_TABS = ['channels', 'customers', 'coupons', 'offers'] as const;
export type PriceTab = (typeof PRICE_TABS)[number];

/** Ülke fiyatı süzgecinin ülkesi; ülke fiyatı satıcının ülkesi dışındaki tek ülkede yazılır. */
export const PRICED_COUNTRY = ProductVatRateSchema.shape.country.options[0];

/**
 * Satır süzgeci: `below` hedef marjın altı, `missing` en az bir kanalda fiyatsız, `auto` otomatik fiyatlı, `country` ülke fiyatı yazılmış
 * boylar. Marj motorun kararı, eksiklik satırın yokluğu olduğu için ikisi yüklenmiş sayfada süzülür; ülke fiyatı bir satırın varlığıdır,
 * ürünü sunucu, boyu sayfa süzer.
 */
export const PRICE_SCOPES = ['all', 'below', 'missing', 'auto', 'country'] as const;
export type PriceScope = (typeof PRICE_SCOPES)[number];

export interface PricesUrlState {
  tab: PriceTab;
  /** Ürün/boy araması (boş = yok). */
  q: string;
  /** Kategori id'si ya da 'all'. */
  cat: string;
  scope: PriceScope;
  /**
   * Ürünler önizlemesindeki "Fiyatlar →" köprüsünün hedefi: liste o ürüne süzülür ve fiyat penceresi açık gelir. Pencere kapanınca
   * parametre düşer, çünkü kalsaydı liste görünmeyen bir süzgeçle tek ürüne bağlı kalırdı.
   */
  productId: string;
}

const DEFAULTS: PricesUrlState = { tab: 'channels', q: '', cat: 'all', scope: 'all', productId: '' };

type RawParams = Record<string, string | string[] | undefined>;
const one = (raw: string | string[] | undefined): string => (Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? ''));

/** URL → ekran durumu; tanınmayan değer varsayılana düşer ki bozuk bağlantı ekranı kırmasın. */
export function parsePricesUrl(params: RawParams): PricesUrlState {
  const tabRaw = one(params.tab);
  const scopeRaw = one(params.scope);
  return {
    tab: PRICE_TABS.find((t) => t === tabRaw) ?? DEFAULTS.tab,
    q: one(params.q).trim(),
    cat: one(params.cat) || DEFAULTS.cat,
    scope: PRICE_SCOPES.find((s) => s === scopeRaw) ?? DEFAULTS.scope,
    productId: one(params.productId).trim(),
  };
}

/** Ekran durumu → URL; varsayılanlar yazılmaz ve sıra sabittir, çünkü aynı görünüm daima aynı adresi üretmeli. */
export function pricesUrl(state: PricesUrlState): string {
  const p = new URLSearchParams();
  if (state.tab !== DEFAULTS.tab) p.set('tab', state.tab);
  if (state.q) p.set('q', state.q);
  if (state.cat !== DEFAULTS.cat) p.set('cat', state.cat);
  if (state.scope !== DEFAULTS.scope) p.set('scope', state.scope);
  if (state.productId) p.set('productId', state.productId);
  const qs = p.toString();
  return qs ? `${PRICES_PATH}?${qs}` : PRICES_PATH;
}

/** Servis süzgeçleri: yalnız sunucunun uygulayabildikleri; marj ve eksiklik süzgeci sayfada kalır (`PRICE_SCOPES`). */
export function toPriceFilters(state: PricesUrlState): {
  query?: string;
  categoryId?: string;
  ids?: string[];
  hasCountryPrice?: typeof PRICED_COUNTRY;
} {
  return {
    query: state.q || undefined,
    categoryId: state.cat === 'all' ? undefined : state.cat,
    ids: state.productId ? [state.productId] : undefined,
    hasCountryPrice: state.scope === 'country' ? PRICED_COUNTRY : undefined,
  };
}

export const SCOPE_LABEL: Record<PriceScope, string> = {
  all: 'Tümü',
  below: 'Marj-altı',
  missing: 'Fiyatı eksik',
  // Kolon adı (`auto_price`) yazılmaz, çünkü operatörün gördüğü veritabanı alanı değil ürünün davranışıdır.
  auto: 'Otomatik fiyatlandırma',
  country: `${COUNTRY_LABELS[PRICED_COUNTRY]} fiyatı olan`,
};

export const TAB_LABEL: Record<PriceTab, string> = {
  channels: 'Kanal fiyatları',
  customers: 'Müşteriye özel',
  coupons: 'Kupon & kampanya',
  // Aynı kuyruk stok ekranında "Yaklaşan tarihli" adıyla duruyor; iki ekranda iki ad tek kuyruğu iki iş gibi gösterirdi.
  offers: 'Yaklaşan tarihli',
};
