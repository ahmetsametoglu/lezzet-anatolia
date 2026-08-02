import { PRODUCT_TABS, PRODUCTS_PATH, type ProductTab } from './products-paths';
import { ProductStatusEnum, type ProductStatus } from '@lezzet/types';
import { one, oneOf, type RawParams } from '@/lib/url-params';

// Ekran durumunun URL SÖZLEŞMESİ — tek kaynak. Sekme ve süzgeçler URL'de taşınır çünkü:
//  · yenileme/paylaşımda aynı görünüm açılır,
//  · SUNUCU okuyabilir → süzme sunucuda yapılır (STACK §6), client tam listeyi çekip filtrelemez.
// Ayrıştırma (URL → durum) ve yazma (durum → URL) BURADA; sayfa ve client aynı işi iki kez yazmaz.

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
   * Oluşturma formu açık mı (`new=1`). NE oluşturulacağını `tab` söyler — türü ayrıca tutmak
   * çelişebilecek bir durum doğururdu (`tab=packages&new=category`). Adreste yaşıyor çünkü sekme de
   * orada: yenilemede aynı form açık kalır, paylaşılan link doğrudan forma düşer ve sekme değişince
   * niyet TEK yerde düşer (ayrı bir sıfırlama etkisine gerek yok).
   */
  creating: boolean;
}

const DEFAULT_URL_STATE: ProductsUrlState = { tab: 'products', q: '', cat: 'all', status: 'all', incomplete: false, creating: false };

/** URL → ekran durumu. Tanınmayan değer sessizce varsayılana düşer (bozuk link ekranı kırmaz). */
export function parseProductsUrl(params: RawParams): ProductsUrlState {
  return {
    tab: oneOf(params.tab, PRODUCT_TABS, DEFAULT_URL_STATE.tab),
    q: one(params.q).trim(),
    cat: one(params.cat) || DEFAULT_URL_STATE.cat,
    status: oneOf(params.status, ProductStatusEnum.options, DEFAULT_URL_STATE.status),
    incomplete: one(params.incomplete) === '1',
    creating: one(params.new) === '1',
  };
}

/**
 * Ekran durumu → URL. Varsayılan değerler YAZILMAZ (temiz adres: süzgeçsiz liste `/operations/products`).
 * Sıra sabit tutulur ki aynı görünüm daima aynı adresi üretsin (paylaşım/önbellek tutarlılığı).
 */
export function productsUrl(state: ProductsUrlState): string {
  const p = new URLSearchParams();
  if (state.tab !== DEFAULT_URL_STATE.tab) p.set('tab', state.tab);
  if (state.q) p.set('q', state.q);
  if (state.cat !== DEFAULT_URL_STATE.cat) p.set('cat', state.cat);
  if (state.status !== DEFAULT_URL_STATE.status) p.set('status', state.status);
  if (state.incomplete) p.set('incomplete', '1');
  if (state.creating) p.set('new', '1');
  const qs = p.toString();
  return qs ? `${PRODUCTS_PATH}?${qs}` : PRODUCTS_PATH;
}

/** Ekran durumundan SERVİS süzgeçlerini türetir — 'all'/boş olanlar hiç geçilmez (undefined). */
export function toProductFilters(state: ProductsUrlState): {
  query?: string;
  categoryId?: string;
  status?: ProductStatus;
  onlyIncomplete?: boolean;
} {
  return {
    query: state.q || undefined,
    categoryId: state.cat === 'all' ? undefined : state.cat,
    status: state.status === 'all' ? undefined : state.status,
    onlyIncomplete: state.incomplete || undefined,
  };
}
