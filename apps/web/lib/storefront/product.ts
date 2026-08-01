import 'server-only';
import { CategoryService, ProductImageService, ProductService, serviceDb } from '@lezzet/database';
import { parseEmphasis } from '@lezzet/helper';
import { hasNutrition, resolveLocalizedText } from '@lezzet/types';
import type { LocalizedText } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Locale } from '@lezzet/i18n';
import type { PlaceWarehouses } from '@/lib/delivery/place-types';
import { EMPTY_PRODUCT_CONTEXT, imageOf, toCategory, toProduct, toVariant } from './map';
import { loadProductContext } from './read-context';
import type { ProductContext } from './map';
import type { StorefrontDeclaration, StorefrontImage, StorefrontProductDetail } from './storefront-types';

/**
 * Ürün detay okuması (08.11) — vitrinin üçüncü veri kapısı.
 *
 * Sayfanın TAMAMI tek turda gelir: ürün + varyantlar, fiyat/stok/teklif bağlamı, galeri, kategori
 * ve benzer ürünler. Bölüm başına ayrı çağrı yapılmaz — bu sayfa sosyal/WhatsApp trafiğinin ilk
 * dokunuşu olabilir, ilk boya eksiksiz gelmelidir.
 *
 * Bugünkü kaynak durumu:
 *   ürün · varyant · fiyat · stok · fırsat · beyan · galeri · benzer ürünler → GERÇEK
 *   yorumlar ve puan                                                        → YOK (17-geri-bildirim)
 *   sepete ekleme                                                           → 07-siparis
 *
 * Yorum bölümü için fixture ÜRETİLMEZ: uydurma sosyal kanıt, eksik sosyal kanıttan kötüdür. Model
 * gelene kadar bölüm sözleşmede de sayfada da yoktur.
 */

/** Benzer ürün şeridinde kaç kart — tasarımda dörtlü ızgara. */
const SIMILAR_LIMIT = 4;

/** Çok dilli metni çözer; boş/boşluk metin YOK sayılır (bölüm başlığı boşuna açılmasın). */
function textOf(value: LocalizedText | null, locale: Locale): string | null {
  if (!value) return null;
  const resolved = resolveLocalizedText(value, locale).trim();
  return resolved.length > 0 ? resolved : null;
}

/** Beyan metni → vurgulu parçalar. `**işaret**` SUNUCUDA çözülür, tarayıcıya ham metin gitmez. */
function segmentsOf(value: LocalizedText | null, locale: Locale) {
  const text = textOf(value, locale);
  return text ? parseEmphasis(text) : null;
}

/**
 * Galeri — kapak görseli HER ZAMAN ilk sıradadır. Ek görseller `product_image` sırasını korur;
 * kapak o listede yoksa (henüz kapak seçilmemiş ürün) yine başa eklenir, böylece galeri asla
 * ürünün kapağıyla çelişen bir görselle açılmaz.
 */
function galleryOf(cover: StorefrontImage, extras: StorefrontImage[]): StorefrontImage[] {
  if (!cover.url) return extras;
  return [cover, ...extras.filter((img) => img.url !== cover.url)];
}

/**
 * Beyan bloğu. Net ağırlık BURADA YOK: paket ağırlığı boya göre değişir, dolayısıyla varyanta aittir
 * ve seçimle birlikte güncellenir (`StorefrontVariant.netWeightG`). Beyanın kendisi 100 g üzerinden
 * sabittir — ürüne aittir, boya değil.
 */
function declarationOf(
  product: { ingredients: LocalizedText | null; storageInstructions: LocalizedText | null; nutrition: StorefrontDeclaration['nutrition']; allergens: StorefrontDeclaration['allergens']; traces: StorefrontDeclaration['traces'] },
  locale: Locale,
): StorefrontDeclaration {
  return {
    ingredients: segmentsOf(product.ingredients, locale),
    allergens: product.allergens,
    traces: product.traces,
    // Hiçbir kalemi girilmemiş künye boş tablo çizdirmesin — "beyan var" izlenimi yanlış olur.
    nutrition: hasNutrition(product.nutrition) ? product.nutrition : null,
    storage: segmentsOf(product.storageInstructions, locale),
  };
}

/**
 * Aynı kategoriden başka ürünler. Ürünün kendisi listeden düşer; kategorisiz üründe bölüm boş kalır
 * (rastgele ürün önerilmez — "benzer" iddiası karşılanamıyorsa hiç iddia edilmez).
 */
async function readSimilar(
  db: SupabaseClient,
  categoryId: string | null,
  excludeId: string,
  locale: Locale,
  place: PlaceWarehouses,
) {
  if (!categoryId) return [];
  const page = await new ProductService(db).listWithRelations({
    filters: { categoryId, status: 'active' },
    limit: SIMILAR_LIMIT + 1, // kendisi de gelebilir; elendikten sonra kart sayısı tutsun
  });
  const rows = page.rows.filter((p) => p.id !== excludeId).slice(0, SIMILAR_LIMIT);
  const context = await loadProductContext(db, rows, place);
  return rows.map((p) => toProduct(p, locale, context.get(p.id) ?? EMPTY_PRODUCT_CONTEXT));
}

/**
 * Slug ile ürün detayı; ürün yoksa ya da satışta değilse `null` → sayfa 404'e çevirir.
 *
 * Aday ve pasif ürün müşteriye AÇILMAZ: katalogda görünmeyen bir ürünün doğrudan linkle satın
 * alınabilir olması, `status`'ün taşıdığı kararı boşa çıkarırdı (DOMAIN §13).
 */
/**
 * `warehouseId` — müşterinin yerinden çözülen depo. **Zorunlu ve varsayılansız**: `null` meşru bir
 * değerdir ("yer bilinmiyor", posta kodu zorunlu değil — K1) ama VERİLMESİ zorunludur. Varsayılan
 * bıraksaydık argümanı unutan çağrı derlenir ve sessizce depo-üstü okurdu — `getAvailableMap`'i
 * kurtaran şey (T8) tam olarak parametrenin zorunluluğuydu, aynı disiplin burada da geçerli.
 *
 * `null` → depo-ÜSTÜ okuma: "tükendi" demenin tek dayanağı hiçbir depoda bulunmamasıdır (C3).
 */
export async function getProductDetail(
  locale: Locale,
  slug: string,
  place: PlaceWarehouses,
): Promise<StorefrontProductDetail | null> {
  const db = serviceDb();
  const product = await new ProductService(db).findBySlug(slug);
  if (!product || product.status !== 'active') return null;

  const [context, images, category, similar] = await Promise.all([
    loadProductContext(db, [product], place),
    new ProductImageService(db).listByProduct(product.id),
    product.categoryId ? new CategoryService(db).getById(product.categoryId) : Promise.resolve(null),
    readSimilar(db, product.categoryId, product.id, locale, place),
  ]);

  const ctx: ProductContext = context.get(product.id) ?? EMPTY_PRODUCT_CONTEXT;
  const variants = ctx.variants.filter((v) => v.isActive);
  const cover = imageOf(product);

  return {
    id: product.id,
    slug: product.slug,
    name: resolveLocalizedText(product.name, locale),
    description: textOf(product.description, locale),
    image: cover,
    gallery: galleryOf(cover, images.map(imageOf)),
    category: category ? toCategory(category, locale) : null,
    variants: variants.map((v) => toVariant(v, locale, ctx, product.shippable)),
    declaration: declarationOf(product, locale),
    shippable: product.shippable,
    similar,
  };
}
