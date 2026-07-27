import 'server-only';
import { CategoryService, ProductService, serviceDb } from '@lezzet/database';
import { DEFAULT_PAGE_SIZE } from '@lezzet/types';
import type { KeysetCursor } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { FIXTURE_CATEGORIES } from './fixtures';
import { loadProductContext } from './read-context';
import { toCategory, toProduct } from './map';
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
 *   fiyat/ölçü · satın alma yolu · tükendi                  → STUB (`map.ts`)
 *   fiyat sıralaması · "yalnız indirimliler"                → STUB(→05.4 · 05.6)
 */

interface CatalogQuery {
  /** Kategori slug'ı — URL'den gelir (dil-bağımsız, içerikten türer). */
  categorySlug?: string;
  search?: string;
  sort?: CatalogSort;
  /** "Yalnız indirimliler" toggle'ı. STUB(→05.6): bugün sonucu daraltmaz. */
  onlyOffers?: boolean;
  cursor?: KeysetCursor;
}

const EMPTY_CONTEXT = { variants: [], prices: new Map(), stock: new Map() };

export async function getCatalogData(locale: Locale, q: CatalogQuery = {}): Promise<StorefrontCatalog> {
  const db = serviceDb();
  const categoryRows = await new CategoryService(db).list({ activeOnly: true });
  const categories = (categoryRows.length ? categoryRows : FIXTURE_CATEGORIES).map((c) => toCategory(c, locale));
  const activeCategory = q.categorySlug ? (categories.find((c) => c.slug === q.categorySlug) ?? null) : null;

  // Aday ürün katalogda GÖRÜNMEZ (`musteri-katalog.md §6`) — `status: 'active'` bunu sağlar.
  const filters = { query: q.search, categoryId: activeCategory?.id, status: 'active' as const };
  const productSvc = new ProductService(db);
  const [page, counts] = await Promise.all([
    productSvc.listWithRelations({ filters, cursor: q.cursor, limit: DEFAULT_PAGE_SIZE }),
    productSvc.counts(filters),
  ]);
  const context = await loadProductContext(db, page.rows);

  return {
    categories,
    activeCategory,
    products: page.rows.map((p) => toProduct(p, locale, context.get(p.id) ?? EMPTY_CONTEXT)),
    total: counts.total,
    nextCursor: page.nextCursor,
  };
}
