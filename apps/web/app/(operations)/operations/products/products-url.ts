import { PRODUCT_TABS, PRODUCTS_PATH, type ProductTab } from './products-paths';
import { ProductStatusEnum, ProductVatRateSchema, type ProductStatus, type ProductVatRate } from '@lezzet/types';
import { one, oneOf, type RawParams } from '@/lib/url-params';

// Ekranın URL sözleşmesi: sekme ve süzgeçler adreste taşınır, çünkü yenilemede aynı görünüm açılmalı ve süzme sunucuda yapılır
// (STACK §6). Ayrıştırma ve yazma burada, sayfa ve istemci aynı işi iki kez yazmaz.

/** Oranı eksik süzgecinin ülkeleri: satıcının ülkesi dışındakiler, çünkü onun oranı ürünün kendi kaydındadır. */
export const RATE_COUNTRIES = ProductVatRateSchema.shape.country.options;

/** Süzgeç durumu — servis `ProductFilters`'ının ekran karşılığı ('all' = süzgeç yok). */
export interface ProductsUrlState {
  tab: ProductTab;
  /** Ad araması (boş = yok). */
  q: string;
  /** Kategori id'si ya da 'all'. */
  cat: string;
  status: ProductStatus | 'all';
  incomplete: boolean;
  /**
   * Yalnız bu ülkenin KDV oranı girilmemiş ürünler (`rateGap=DE`); oranı olmayan ürün o ülkenin tüketicisine satılmaz. İsteğe bağlı,
   * çünkü başka ekranların köprüleri bu süzgeci taşımaz.
   */
  rateGap?: ProductVatRate['country'] | null;
  /**
   * Oluşturma formu açık mı (`new=1`); ne oluşturulacağını `tab` söyler, türü ayrıca tutmak çelişen bir durum doğururdu. Adreste
   * yaşar ki yenilemede form açık kalsın ve sekme değişince niyet tek yerde düşsün.
   */
  creating: boolean;
  /** Dış köprünün hedefi: doluyken liste o ürüne süzülür ve düzenleme penceresi açık gelir; kapanınca parametre düşer. */
  productId: string;
  /**
   * Seçili satır (`p=<id>`): bağlantı paylaşılabilsin ve yenilemede seçim kaybolmasın. `productId`den farkı süzgeç ya da pencere
   * tetiği olmamasıdır; yazımı sığdır, çünkü panel yüklenmiş listeden beslenir.
   */
  selected: string;
}

const DEFAULT_URL_STATE: ProductsUrlState = {
  tab: 'products',
  q: '',
  cat: 'all',
  status: 'all',
  incomplete: false,
  rateGap: null,
  creating: false,
  productId: '',
  selected: '',
};

/** URL → ekran durumu. Tanınmayan değer sessizce varsayılana düşer (bozuk link ekranı kırmaz). */
export function parseProductsUrl(params: RawParams): ProductsUrlState {
  return {
    tab: oneOf(params.tab, PRODUCT_TABS, DEFAULT_URL_STATE.tab),
    q: one(params.q).trim(),
    cat: one(params.cat) || DEFAULT_URL_STATE.cat,
    status: oneOf(params.status, ProductStatusEnum.options, DEFAULT_URL_STATE.status),
    incomplete: one(params.incomplete) === '1',
    rateGap: RATE_COUNTRIES.find((country) => country === one(params.rateGap)) ?? null,
    creating: one(params.new) === '1',
    productId: one(params.productId).trim(),
    selected: one(params.p).trim(),
  };
}

/**
 * Ekran durumu → URL; varsayılan değerler yazılmaz ki süzgeçsiz liste temiz adreste dursun. Sıra sabittir, çünkü aynı görünüm
 * paylaşımda ve önbellekte daima aynı adresi üretmeli.
 */
export function productsUrl(state: ProductsUrlState): string {
  const p = new URLSearchParams();
  if (state.tab !== DEFAULT_URL_STATE.tab) p.set('tab', state.tab);
  if (state.q) p.set('q', state.q);
  if (state.cat !== DEFAULT_URL_STATE.cat) p.set('cat', state.cat);
  if (state.status !== DEFAULT_URL_STATE.status) p.set('status', state.status);
  if (state.incomplete) p.set('incomplete', '1');
  if (state.rateGap) p.set('rateGap', state.rateGap);
  if (state.creating) p.set('new', '1');
  if (state.productId) p.set('productId', state.productId);
  if (state.selected) p.set('p', state.selected);
  const qs = p.toString();
  return qs ? `${PRODUCTS_PATH}?${qs}` : PRODUCTS_PATH;
}

/** Ekran durumundan SERVİS süzgeçlerini türetir — 'all'/boş olanlar hiç geçilmez (undefined). */
export function toProductFilters(state: ProductsUrlState): {
  query?: string;
  categoryId?: string;
  status?: ProductStatus;
  onlyIncomplete?: boolean;
  missingCountryRate?: ProductVatRate['country'];
  ids?: string[];
} {
  return {
    query: state.q || undefined,
    categoryId: state.cat === 'all' ? undefined : state.cat,
    status: state.status === 'all' ? undefined : state.status,
    onlyIncomplete: state.incomplete || undefined,
    missingCountryRate: state.rateGap ?? undefined,
    // Tek ürün hedefi servis `ids` süzgecine biner (fiyat ekranıyla aynı yol).
    ids: state.productId ? [state.productId] : undefined,
  };
}
