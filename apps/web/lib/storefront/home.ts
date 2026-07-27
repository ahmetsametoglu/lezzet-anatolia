import 'server-only';
import { CategoryService, ProductService, serviceDb } from '@lezzet/database';
import { publicImageUrl } from '@lezzet/storage';
import { cropOf, resolveLocalizedText } from '@lezzet/types';
import type { Category, ImageMeta, Product } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import {
  FIXTURE_CATEGORIES,
  FIXTURE_OFFERS,
  FIXTURE_PACKAGES,
  FIXTURE_PRODUCTS,
  FIXTURE_PRODUCT_DETAILS,
  NO_IMAGE_META,
} from './fixtures';
import type {
  StorefrontCategory,
  StorefrontHome,
  StorefrontImage,
  StorefrontOffer,
  StorefrontPackage,
  StorefrontProduct,
} from './storefront-types';

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

/** Görsel künyesini karta indirger — anahtar→URL ve odak/zoom çözümü TEK yerde. */
function imageOf(row: ImageMeta): StorefrontImage {
  return { url: publicImageUrl(row.imageKey, row.imageUpdatedAt), crop: cropOf(row) };
}

/** Fixture ve gerçek satır aynı şekli taşır (`NO_IMAGE_META`) → tek indirgeme ikisine de uyar. */
type CategoryRow = Pick<Category, 'id' | 'slug' | 'name'> & ImageMeta;
type ProductRow = Pick<Product, 'id' | 'slug' | 'name'> & ImageMeta;

function toCategory(row: CategoryRow, locale: Locale): StorefrontCategory {
  return { id: row.id, slug: row.slug, name: resolveLocalizedText(row.name, locale), image: imageOf(row) };
}

/**
 * Ürünü vitrin kartına indirger. Fiyat ve ölçü etiketi henüz üretilemediği için sıra numarasına
 * göre sabit bir stub künyeye eşlenir — kart gerçekçi görünsün diye. 05.4 gelince bu eşleme kalkar,
 * kartın kendisi değişmez.
 */
const STUB_DETAILS = Object.values(FIXTURE_PRODUCT_DETAILS);

function toProduct(row: ProductRow, locale: Locale, index: number): StorefrontProduct {
  const stub = STUB_DETAILS[index % STUB_DETAILS.length];
  return {
    id: row.id,
    slug: row.slug,
    name: resolveLocalizedText(row.name, locale),
    image: imageOf(row),
    unitLabel: stub?.unitLabel ?? '',
    comparisonCents: stub?.comparisonCents ?? 0,
    priceCents: stub?.priceCents ?? 0,
  };
}

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
