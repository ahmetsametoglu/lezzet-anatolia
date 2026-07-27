import 'server-only';
import { CategoryService, ProductService, serviceDb } from '@lezzet/database';
import { DEFAULT_PAGE_SIZE, type KeysetCursor } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { FIXTURE_CATEGORIES, FIXTURE_PRODUCTS } from './fixtures';
import { toCategory, toProduct } from './map';
import type { StorefrontCategory, StorefrontProduct } from './storefront-types';

/**
 * Katalog okuması (08.10) — vitrinin ikinci veri kapısı.
 *
 * Süzme ve sayfalama SUNUCUDA: `ProductService.list` ad araması (üç dilde birden) ve kategori
 * süzgecini SQL'de çözer, sayfalama keyset'tir (`CLAUDE.md`: tüm listeler sonsuz kaydırma → servis
 * okumaları cursor'lu). Liste büyüdükçe istemciye taşınan yük artmaz.
 *
 * Bugünkü kaynak durumu:
 *   kategori süzgeci · ad araması · sayfalama · toplam sayı → GERÇEK
 *   fiyat/ölçü · satın alma yolu · tükendi                  → STUB (`map.ts`)
 *   fiyat sıralaması · "yalnız indirimliler"                → STUB(→05.4 · 05.6)
 */

/** Sıralama seçenekleri (K18). `featured` bugünkü tek gerçek sıra — servis `sort_order` ile döner. */
export type CatalogSort = 'featured' | 'priceAsc' | 'priceDesc';
export const CATALOG_SORTS: CatalogSort[] = ['featured', 'priceAsc', 'priceDesc'];

interface CatalogQuery {
  /** Kategori slug'ı — URL'den gelir (dil-bağımsız, içerikten türer). */
  categorySlug?: string;
  search?: string;
  sort?: CatalogSort;
  /** "Yalnız indirimliler" toggle'ı. STUB(→05.6): bugün sonucu daraltmaz. */
  onlyOffers?: boolean;
  cursor?: KeysetCursor;
}

export interface StorefrontCatalog {
  categories: StorefrontCategory[];
  /** Seçili kategori (yoksa tüm katalog) — başlık bandı ve çip seçimi bunu kullanır. */
  activeCategory: StorefrontCategory | null;
  products: StorefrontProduct[];
  /** Sonuç sayısı — "24 ürün" satırı. Süzgeçle birlikte değişir. */
  total: number;
  /** null ise liste bitti; istemci "daha fazla"yı kapatır. */
  nextCursor: KeysetCursor | null;
}

export async function getCatalogData(locale: Locale, q: CatalogQuery = {}): Promise<StorefrontCatalog> {
  const db = serviceDb();
  const categoryRows = await new CategoryService(db).list({ activeOnly: true });
  const categories = (categoryRows.length ? categoryRows : FIXTURE_CATEGORIES).map((c) => toCategory(c, locale));
  const activeCategory = q.categorySlug ? (categories.find((c) => c.slug === q.categorySlug) ?? null) : null;

  // Aday ürün katalogda GÖRÜNMEZ (`musteri-katalog.md §6`) — `status: 'active'` bunu sağlar.
  const filters = { query: q.search, categoryId: activeCategory?.id, status: 'active' as const };
  const productSvc = new ProductService(db);
  const [page, counts] = await Promise.all([
    productSvc.list({ filters, cursor: q.cursor, limit: DEFAULT_PAGE_SIZE }),
    productSvc.counts(filters),
  ]);

  // Katalog boşken (seed atılmamış) fixture'a düşülür — yalnız süzgeçsiz ilk sayfada, yoksa
  // "sonuç yok" durumu hiç görünmezdi ve sıfır-sonuç ekranı test edilemezdi.
  const noFilter = !q.search && !q.categorySlug;
  const rows = page.rows.length || !noFilter ? page.rows : FIXTURE_PRODUCTS;

  return {
    categories,
    activeCategory,
    products: rows.map((p, i) => toProduct(p, locale, i)),
    total: page.rows.length ? counts.total : rows.length,
    nextCursor: page.nextCursor,
  };
}
