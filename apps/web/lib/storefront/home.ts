import 'server-only';
import { CategoryService, ProductService, serviceDb } from '@lezzet/database';
import { resolveLocalizedText } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { FIXTURE_CATEGORIES, FIXTURE_OFFERS, FIXTURE_PACKAGES, FIXTURE_PRODUCTS, NO_IMAGE_META } from './fixtures';
import { imageOf, toCategory, toProduct } from './map';
import type { StorefrontHome, StorefrontOffer, StorefrontPackage } from './storefront-types';

/**
 * Anasayfa okuması — vitrinin veri KAPISI (08.10). Sayfa servisi doğrudan çağırmaz, buradan okur.
 *
 * Bugünkü kaynak durumu:
 *   kategoriler · vitrin ürünleri → GERÇEK (`CategoryService`, `ProductService`, R2 görselleri)
 *   fiyat · ölçü etiketi          → STUB(08.10 → 05.4 fiyat · 05.10 varyant etiketi)
 *   fırsatlar                     → STUB(08.10 → 05.6 indirim tanımı)
 *   paketler                      → STUB(08.10 → 05.5 Bundle servisi)
 *
 * Kaynak geldiğinde değişen tek yer bu dosyadır; sayfa ve komponentler bugünkü hâliyle kalır.
 *
 * Katalog boşken (seed atılmamış yerel ortam) fixture'a düşülür — geliştirme sırasında vitrinin
 * görünür kalması için. Gerçek katalog dolunca bu yedek kendiliğinden devre dışı kalır.
 */

function fixtureOffers(locale: Locale): StorefrontOffer[] {
  return FIXTURE_OFFERS.map((o, i) => ({
    ...toProduct(o.product, locale, i),
    unitLabel: o.unitLabel,
    comparisonCents: o.comparisonCents,
    priceCents: o.priceCents,
    wasCents: o.wasCents,
    limitLabel: o.limitPerCustomer > 0 ? String(o.limitPerCustomer) : null,
  }));
}

function fixturePackages(locale: Locale): StorefrontPackage[] {
  return FIXTURE_PACKAGES.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: resolveLocalizedText(p.name, locale),
    description: resolveLocalizedText(p.description, locale),
    image: imageOf(NO_IMAGE_META),
    itemCount: p.itemCount,
    priceCents: p.priceCents,
  }));
}

/** Anasayfanın tüm bölümleri tek turda — bölüm başına ayrı çağrı yapılmaz. */
export async function getHomeData(locale: Locale): Promise<StorefrontHome> {
  const db = serviceDb();
  const [categoryRows, productRows] = await Promise.all([
    new CategoryService(db).list({ activeOnly: true }),
    new ProductService(db).listSellable(),
  ]);

  const categories = (categoryRows.length ? categoryRows : FIXTURE_CATEGORIES).map((c) => toCategory(c, locale));
  // Vitrin seçkisi: bugün ilk dörtlü. Gerçek seçki alanı (öne çıkarma bayrağı) katalogda yok —
  // geldiğinde sorgu burada değişir, kart aynı kalır.
  const featuredRows = productRows.length ? productRows.slice(0, 4) : FIXTURE_PRODUCTS;
  const featured = featuredRows.map((p, i) => toProduct(p, locale, i));

  return { categories, featured, offers: fixtureOffers(locale), packages: fixturePackages(locale) };
}
