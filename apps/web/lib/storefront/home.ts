import 'server-only';
import { CategoryService, ProductService, serviceDb } from '@lezzet/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Locale } from '@lezzet/i18n';
import { FIXTURE_CATEGORIES } from './fixtures';
import { listOfferProductIds, loadProductContext } from './read-context';
import { EMPTY_PRODUCT_CONTEXT, toCategory, toProduct } from './map';
import { HOME_PACKAGE_LIMIT, listStorefrontPackages } from './packages';
import type { StorefrontHome, StorefrontOffer, StorefrontProduct } from './storefront-types';

/**
 * Anasayfa okuması — vitrinin veri KAPISI (08.10). Sayfa servisi doğrudan çağırmaz, buradan okur.
 *
 * Bugünkü kaynak durumu:
 *   kategoriler · vitrin ürünleri → GERÇEK (`CategoryService`, `ProductService`, R2 görselleri)
 *   fiyat · stok · fırsatlar      → GERÇEK (`PriceService`, `StockService`, `domain-core`)
 *   paketler                      → GERÇEK (05.5 indi; `listStorefrontPackages`, fixture kalktı)
 *
 * Kaynak geldiğinde değişen tek yer bu dosyadır; sayfa ve komponentler bugünkü hâliyle kalır.
 *
 * Katalog boşken (seed atılmamış yerel ortam) fixture'a düşülür — geliştirme sırasında vitrinin
 * görünür kalması için. Gerçek katalog dolunca bu yedek kendiliğinden devre dışı kalır.
 */

/** Fırsat bandında en çok kaç kart — tasarımda üçlü ızgara (K8), fazlası bandı taşırır. */
const OFFER_LIMIT = 6;

/** Kartın fırsat hâline geçtiğinin tek ölçütü: motor teklifi kazandırdı → üstü çizili referans var. */
function isOffer(p: StorefrontProduct): p is StorefrontOffer {
  return p.wasCents !== undefined;
}

/**
 * Fırsat bandı — near-expiry teklifine açılmış partilerden doğar (DOMAIN §5). Teklif sayısı küçük
 * olduğu için zincir sabit maliyetlidir; kart başına sorgu yoktur.
 *
 * İndirimin gerçekten uygulanıp uygulanmadığına burada karar VERİLMEZ: `toProduct` fiyatı motora
 * çözdürür, teklif normal fiyatı yenemezse ürün fırsat sayılmaz ve banda girmez. Bant boş kalırsa
 * sayfa bölümü tamamen kaldırır — boş hâl gösterilmez (komponent envanteri K8).
 */
async function readOffers(db: SupabaseClient, locale: Locale): Promise<StorefrontOffer[]> {
  const productIds = await listOfferProductIds(db);
  if (!productIds.length) return [];

  const page = await new ProductService(db).listWithRelations({ filters: { ids: productIds, status: 'active' }, limit: OFFER_LIMIT });
  const context = await loadProductContext(db, page.rows);
  return page.rows.map((p) => toProduct(p, locale, context.get(p.id) ?? EMPTY_PRODUCT_CONTEXT)).filter(isOffer);
}

/** Anasayfanın tüm bölümleri tek turda — bölüm başına ayrı çağrı yapılmaz. */
export async function getHomeData(locale: Locale): Promise<StorefrontHome> {
  const db = serviceDb();
  const [categoryRows, page, offers, packages] = await Promise.all([
    new CategoryService(db).list({ activeOnly: true }),
    // Vitrin seçkisi: bugün ilk dörtlü (öne çıkarma bayrağı katalogda yok).
    new ProductService(db).listWithRelations({ filters: { status: 'active' }, limit: 4 }),
    readOffers(db, locale),
    listStorefrontPackages(locale),
  ]);
  const context = await loadProductContext(db, page.rows);

  const categories = (categoryRows.length ? categoryRows : FIXTURE_CATEGORIES).map((c) => toCategory(c, locale));
  const featured = page.rows.map((p) => toProduct(p, locale, context.get(p.id) ?? EMPTY_PRODUCT_CONTEXT));

  // Bant bir SEÇKİ, liste değil: sabit sınırla kesilir (CLAUDE.md §1). Tükenmişler sona alınmış
  // geldiği için sınır önce satılabilirleri alır.
  return { categories, featured, offers, packages: packages.slice(0, HOME_PACKAGE_LIMIT) };
}
