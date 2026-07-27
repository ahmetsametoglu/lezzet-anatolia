import type { ComponentProps } from 'react';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { Link } from '@/i18n/navigation';
import type { CatalogSort, StorefrontCatalog, StorefrontProduct } from '@/lib/storefront/storefront-types';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir) — bu yüzden `import type` değil.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

// Katalog tip/sözleşme modülü (view DEĞİL — gerçek view'lar catalog.desktop/catalog.mobile).

export type Messages = LocalizedCopy<typeof messages>;

/** Süzgeç bağlantısının hedefi — seçim URL'de yaşar, client state'te değil. */
export type CatalogHref = ComponentProps<typeof Link>['href'];

export interface CatalogViewProps {
  t: Messages;
  locale: Locale;
  data: StorefrontCatalog;
  /**
   * Gösterilecek ürünler — ilk sayfa sunucudan, sonrakiler kaydırdıkça EKLENİR. `data.products`
   * yalnız ilk sayfadır; görünüm bunu değil bunu kullanır.
   */
  products: StorefrontProduct[];
  /** Devam eden sayfa var mı — yoksa tetikleyici hiç çizilmez. */
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  /** Etkin süzgeçler — çip ve sıralama seçimlerinin işaretlenmesi için. */
  active: { category?: string; sort: CatalogSort; onlyOffers: boolean };
  /** Bir süzgeci değiştirip diğerlerini koruyan URL üretir (süzgeçler birbirini silmez). */
  hrefFor: (patch: { category?: string | null; sort?: CatalogSort; onlyOffers?: boolean }) => CatalogHref;
}
