import type { CatalogProduct, CatalogSelling } from '@lezzet/types';
import type { useRouter } from 'expo-router';

/** Kartın bildiği ürün bilgisi; detay ekranı veri gelene kadar üst bölümü bununla çizer ki dokunuşla sayfa boş açılmasın. */
export type ProductPreview = Pick<CatalogProduct, 'slug' | 'name' | 'image' | 'categoryId'> & CatalogSelling;

/** Son açılan kartlar; ekran yalnız açılan ürünün kaydını okur, sınır belleğin oturum boyunca büyümesini keser. */
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

/** Kartın bilgisini bırakıp ürün sayfasını açar; listeler ürünü bu kapıdan açar ki detay boş açılmasın. */
export function openProductFromCard(router: Pick<ReturnType<typeof useRouter>, 'push'>, product: ProductPreview): void {
  rememberProductPreview(product);
  router.push({ pathname: '/product/[slug]', params: { slug: product.slug } });
}
