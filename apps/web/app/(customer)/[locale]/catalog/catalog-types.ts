import type { ComponentProps } from 'react';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { Link } from '@/i18n/navigation';
import type { CatalogSort } from '@lezzet/types';
import type { StorefrontCatalog, StorefrontProduct } from '@lezzet/application';
import type { PlaceMode } from '@/lib/delivery/read-place';
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
  /** Koleksiyon kesiti (08.26) — kategoriyle birlikte durabilir, biri ötekini ezmez. */
  collection?: string;
  sort: CatalogSort;
  onlyOffers: boolean;
  onlyShippable: boolean;
}

/**
 * Tek süzgeci değiştirip diğerlerini koruyan yama — `category: null` süzgeci kaldırır ("Tümü").
 * `collection: null` da aynı anlamda: "tüm kataloğa dön".
 */
export type CatalogFilterPatch = Partial<Omit<CatalogFilters, 'category' | 'collection'>> & {
  category?: string | null;
  collection?: string | null;
};

export interface CatalogViewProps {
  t: Messages;
  locale: Locale;
  /**
   * **Yerin teslimat kipi** — "adresime gönderilebilir" çipinin anlamı buna bağlı (08.27).
   *
   * İstemci `useDeliveryPlace()` ile de öğrenebilirdi ama ilk boyada `ready` false: çip bir an
   * çizilip sonra kaybolurdu (yerleşim sıçraması). Sunucu yeri zaten çözüyor — soruyu orada
   * cevaplamak hem sıçramayı hem ikinci bir türetmeyi ortadan kaldırıyor.
   */
  placeMode: PlaceMode;
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
