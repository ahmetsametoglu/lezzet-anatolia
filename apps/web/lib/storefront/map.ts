import { publicImageUrl } from '@lezzet/storage';
import { cropOf, resolveLocalizedText } from '@lezzet/types';
import type { Category, ImageMeta, Product } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { FIXTURE_PRODUCT_DETAILS } from './fixtures';
import type { StorefrontCategory, StorefrontImage, StorefrontProduct } from './storefront-types';

/**
 * DB satırı → vitrin kartı indirgemesi. Anasayfa ve katalog AYNI indirgemeyi kullanır; ayrı yazılsa
 * iki sayfa aynı ürünü farklı gösterebilirdi (no-duplication).
 *
 * Fixture ve gerçek satır aynı şekli taşır (`NO_IMAGE_META`) → tek fonksiyon ikisine de uyar.
 */

/** Görsel künyesini karta indirger — anahtar→URL ve odak/zoom çözümü TEK yerde. */
export function imageOf(row: ImageMeta): StorefrontImage {
  return { url: publicImageUrl(row.imageKey, row.imageUpdatedAt), crop: cropOf(row) };
}

type CategoryRow = Pick<Category, 'id' | 'slug' | 'name'> & ImageMeta;
type ProductRow = Pick<Product, 'id' | 'slug' | 'name'> & ImageMeta;

export function toCategory(row: CategoryRow, locale: Locale): StorefrontCategory {
  return { id: row.id, slug: row.slug, name: resolveLocalizedText(row.name, locale), image: imageOf(row) };
}

/**
 * Ürünü vitrin kartına indirger.
 *
 * Fiyat, ölçü etiketi, satın alma yolu ve stok durumu henüz üretilemiyor; sıra numarasına göre sabit
 * bir stub künyeye eşlenir — kart gerçekçi görünsün ve TÜM durumları (fırsat · tükendi · çok
 * varyantlı) geliştirme sırasında görülebilsin diye. Kaynaklar geldiğinde bu eşleme kalkar, kartın
 * kendisi değişmez. STUB(08.10 → 05.4 fiyat · 05.5 varyant · 06 stok)
 */
const STUB_DETAILS = Object.values(FIXTURE_PRODUCT_DETAILS);

export function toProduct(row: ProductRow, locale: Locale, index: number): StorefrontProduct {
  const stub = STUB_DETAILS[index % STUB_DETAILS.length];
  return {
    id: row.id,
    slug: row.slug,
    name: resolveLocalizedText(row.name, locale),
    image: imageOf(row),
    unitLabel: stub?.unitLabel ?? '',
    comparisonCents: stub?.comparisonCents ?? 0,
    priceCents: stub?.priceCents ?? 0,
    // Dördün biri çok varyantlı, beşin biri tükenmiş — kart durumları listede temsil edilsin diye.
    purchaseMode: index % 4 === 1 ? 'options' : 'quick',
    soldOut: index % 5 === 4,
  };
}
