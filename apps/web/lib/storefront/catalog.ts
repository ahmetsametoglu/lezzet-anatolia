import 'server-only';
import { CategoryService, ProductListingService, ProductService, serviceDb } from '@lezzet/database';
import { DEFAULT_PAGE_SIZE } from '@lezzet/types';
import type { KeysetCursor } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { FIXTURE_CATEGORIES } from './fixtures';
import { listOfferProductIds, loadProductContext } from './read-context';
import { EMPTY_PRODUCT_CONTEXT, toCategory, toProduct } from './map';
import type { CatalogSort, StorefrontCatalog } from './storefront-types';

/**
 * Katalog okuması (08.10) — vitrinin ikinci veri kapısı.
 *
 * Süzme ve sayfalama SUNUCUDA: `ProductService.list` ad araması (üç dilde birden) ve kategori
 * süzgecini SQL'de çözer, sayfalama keyset'tir (`CLAUDE.md`: tüm listeler sonsuz kaydırma → servis
 * okumaları cursor'lu). Liste büyüdükçe istemciye taşınan yük artmaz.
 *
 * Bugünkü kaynak durumu:
 *   kategori süzgeci · ad araması · sayfalama · toplam sayı → GERÇEK
 *   fiyat · tükendi · satın alma yolu · "yalnız indirimliler" → GERÇEK (`map.ts`, near-expiry teklifi)
 *   fiyat sıralaması                                        → GERÇEK (28.07, `product_listing` görünümü)
 *
 * **Fiyat sıralaması neden bir migration istedi:** uygulanabilir fiyat AYRI tablodadır (kanal +
 * geçerlilik tarihi + müşteriye özel satır) ve "bu ürünün b2c fiyatı" tek bir kolon değil bir
 * SEÇİMDİR. Sayfa çekildikten sonra sıralamak seçenek değil — "artan fiyat" yalnız o 30 satır içinde
 * artan olur ve keyset sayfalama bozulur. Çözüm `available_stock` deseninde bir okuma görünümü
 * (`0034`): seçim SQL'de çözülür, sıralama ve imleç onun üstünde çalışır.
 */

interface CatalogQuery {
  /** Kategori slug'ı — URL'den gelir (dil-bağımsız, içerikten türer). */
  categorySlug?: string;
  search?: string;
  sort?: CatalogSort;
  /** "Yalnız indirimliler" — açık teklifi olan ürünlere daraltır (DOMAIN §5). */
  onlyOffers?: boolean;
  /**
   * Yalnız kargolanabilenler — "adresime gönderilebilir" çipi. Çip VARSAYILAN KAPALIDIR (tasarım):
   * bölge dışı bir posta kodunda soğuk zincir ürünleri gizlenmez, kartta etiketiyle durur. Katalogu
   * kendiliğinden küçültmek, müşteriye sormadan seçim yapmak olurdu.
   */
  onlyShippable?: boolean;
  cursor?: KeysetCursor;
}

/** Ürün bulunmayan katalog cevabı — süzgeç hiçbir şeyi getirmediğinde sorgu boşa atılmasın. */
const noProducts = (categories: StorefrontCatalog['categories'], activeCategory: StorefrontCatalog['activeCategory']): StorefrontCatalog => ({
  categories,
  activeCategory,
  products: [],
  total: 0,
  nextCursor: null,
});


export async function getCatalogData(locale: Locale, q: CatalogQuery = {}): Promise<StorefrontCatalog> {
  const db = serviceDb();
  const categoryRows = await new CategoryService(db).list({ activeOnly: true });
  const categories = (categoryRows.length ? categoryRows : FIXTURE_CATEGORIES).map((c) => toCategory(c, locale));
  const activeCategory = q.categorySlug ? (categories.find((c) => c.slug === q.categorySlug) ?? null) : null;

  // "Yalnız indirimliler": teklifli ürünler önden çözülür ve SORGUYA girer — sayfa çekildikten
  // sonra elemek keyset sayfalamayı ve toplam sayıyı bozardı.
  const offerIds = q.onlyOffers ? await listOfferProductIds(db) : undefined;
  if (offerIds && !offerIds.length) return noProducts(categories, activeCategory);

  // Aday ürün katalogda GÖRÜNMEZ (`musteri-katalog.md §6`) — `status: 'active'` bunu sağlar.
  const filters = { query: q.search, categoryId: activeCategory?.id, status: 'active' as const, ids: offerIds, onlyShippable: q.onlyShippable };
  const productSvc = new ProductService(db);
  // Fiyat sıralaması AYRI kaynaktan okunur (`product_listing` görünümü, 0034): sıralama anahtarı
  // ürün tablosunda yoktur. Süzgeçler ve satır şeması ortaktır — ayrışan tek şey sıra.
  const direction = q.sort === 'priceAsc' ? 'asc' : q.sort === 'priceDesc' ? 'desc' : null;
  const [page, counts] = await Promise.all([
    direction
      ? new ProductListingService(db).listByPrice({ filters, cursor: q.cursor, limit: DEFAULT_PAGE_SIZE, direction })
      : productSvc.listWithRelations({ filters, cursor: q.cursor, limit: DEFAULT_PAGE_SIZE }),
    productSvc.counts(filters),
  ]);
  const context = await loadProductContext(db, page.rows);

  return {
    categories,
    activeCategory,
    products: page.rows.map((p) => toProduct(p, locale, context.get(p.id) ?? EMPTY_PRODUCT_CONTEXT)),
    total: counts.total,
    nextCursor: page.nextCursor,
  };
}
