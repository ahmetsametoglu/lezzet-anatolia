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

/**
 * Etkin süzgeçler — **tek tanım** (03.08).
 *
 * Bu şekil bir ara dört yerde elle yazılıydı (görünüm props'u, yama imzası, istemci, sayfalama
 * kapısı) ve olması gereken oldu: `onlyShippable` kopyaların BİRİNDEN düştü. Sonuç görünmez bir
 * arızaydı — "adresime gönderilebilir" işaretli müşteri aşağı kaydırınca gönderilemeyen ürünleri
 * görüyor, çip ise hâlâ etkin duruyordu. Süzgeç eklendiğinde tek yer değişsin diye tip burada.
 *
 * `search` bilerek DIŞARIDA: o bir çip değil, adresin `q` parametresi ve çerçeveden geliyor.
 */
export interface CatalogFilters {
  category?: string;
  sort: CatalogSort;
  onlyOffers: boolean;
  onlyShippable: boolean;
}

/** Tek süzgeci değiştirip diğerlerini koruyan yama — `category: null` süzgeci kaldırır ("Tümü"). */
export type CatalogFilterPatch = Partial<Omit<CatalogFilters, 'category'>> & { category?: string | null };

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
  active: CatalogFilters;
  /** Adresteki güncel arama — kutu ne arandığını göstersin (çerçeveden buraya geldi). */
  search?: string;
  /** Bir süzgeci değiştirip diğerlerini koruyan URL üretir (süzgeçler birbirini silmez). */
  hrefFor: (patch: CatalogFilterPatch) => CatalogHref;
}
