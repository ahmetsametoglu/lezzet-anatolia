import type { StorefrontProduct } from '@lezzet/application';
import type { CatalogProduct } from '@lezzet/types';

/**
 * Kartın bildiği ürün bilgisi; telefonda ürün sayfasının yükleme karesi üst bölümü bununla çizer ki dokunuşla sayfa boş açılmasın.
 * Kategori tel sözleşmesinden alınır, çünkü vitrin kartları o tiptedir ve alan orada gelmeyebilir; gelmezse satırın yeri ayrılır.
 */
export type ProductPreview = Pick<
  StorefrontProduct,
  | 'id'
  | 'slug'
  | 'name'
  | 'image'
  | 'priceCents'
  | 'wasCents'
  | 'comparisonCents'
  | 'comparisonUnit'
  | 'limitLabel'
  | 'stockStatus'
  | 'soldOut'
> &
  Pick<CatalogProduct, 'categoryId' | 'sizes'>;

/** Son açılan kartlar; sınır belleğin oturum boyunca büyümesini keser. Yalnız tarayıcıda, tıklamayla yazılır. */
const PREVIEW_LIMIT = 30;
const previews = new Map<string, ProductPreview>();

export function rememberProductPreview(product: ProductPreview): void {
  previews.delete(product.slug);
  previews.set(product.slug, product);
  if (previews.size <= PREVIEW_LIMIT) return;
  const oldest = previews.keys().next();
  if (!oldest.done) previews.delete(oldest.value);
}

export function productPreviewOf(slug: string): ProductPreview | null {
  return previews.get(slug) ?? null;
}
