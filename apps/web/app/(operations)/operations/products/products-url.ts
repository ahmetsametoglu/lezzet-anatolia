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
  /**
   * DIŞ KÖPRÜNÜN hedefi (16.08, fiyat ekranının deseni): doluyken liste o ürüne süzülür, satır
   * seçili ve DÜZENLEME diyaloğu açık gelir; kapanınca parametre düşer, tam liste geri gelir.
   * (Eski künye "yalnız düzenlemeyi adrese taşımak yarım iş olurdu — hangi kaydın düzenlendiği
   * bilinmez" diyordu; kimlik adreste taşınınca o itiraz düştü.)
   */
  productId: string;
  /**
   * SEÇİLİ satır (`p=<id>`, 16.08 — tarif ekranının `?r=` deseni): önizleme panelinin bağlantısı
   * paylaşılabilmeli ve yenilemede seçim kaybolmamalı. `productId`den FARKI: bu bir süzgeç ve
   * diyalog tetiği DEĞİL, salt seçim — liste süzülmez, diyalog açılmaz; yazımı da SIĞDIR
   * (`replaceState`, sunucuya gitmez — panel zaten yüklenmiş listeden beslenir).
   */
  selected: string;
}

const DEFAULT_URL_STATE: ProductsUrlState = { tab: 'products', q: '', cat: 'all', status: 'all', incomplete: false, creating: false, productId: '', selected: '' };

/** URL → ekran durumu. Tanınmayan değer sessizce varsayılana düşer (bozuk link ekranı kırmaz). */
export function parseProductsUrl(params: RawParams): ProductsUrlState {
  return {
    tab: oneOf(params.tab, PRODUCT_TABS, DEFAULT_URL_STATE.tab),
    q: one(params.q).trim(),
    cat: one(params.cat) || DEFAULT_URL_STATE.cat,
    status: oneOf(params.status, ProductStatusEnum.options, DEFAULT_URL_STATE.status),
    incomplete: one(params.incomplete) === '1',
    creating: one(params.new) === '1',
    productId: one(params.productId).trim(),
    selected: one(params.p).trim(),
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
  ids?: string[];
} {
  return {
    query: state.q || undefined,
    categoryId: state.cat === 'all' ? undefined : state.cat,
    status: state.status === 'all' ? undefined : state.status,
    onlyIncomplete: state.incomplete || undefined,
    // Tek ürün hedefi servis `ids` süzgecine biner (fiyat ekranıyla aynı yol).
    ids: state.productId ? [state.productId] : undefined,
  };
}
