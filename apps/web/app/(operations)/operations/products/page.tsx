import {
  CategoryService,
  CollectionService,
  ProductService,
  ProductVariantService,
  serviceDb,
} from '@lezzet/database';
import { resolveLocalizedText } from '@lezzet/types';
import { getR2 } from '@lezzet/storage';
import { detectDevice } from '@/lib/device';
import { ProductsClient } from './products-client';
import type { CategoryView, CollectionView, ProductView } from './products-types';

// Admin katalog yönetimi — Ürünler. ProductService/CategoryService/CollectionService'in ilk uçtan uca
// tüketicisi: veri burada (RSC) okunur, DB Product'ı TÜRETEN view-model'e (& ile) indirilir; yalnız
// türetilmiş/join alanlar eklenir (resolved kategori adı, signed görsel, varyantlar, koleksiyon adları).
// Durum/dolu-dil gibi saf türevler client'ta (productStatus/filledContentLangs) hesaplanır.

export default async function ProductsPage() {
  const db = serviceDb();
  const productSvc = new ProductService(db);
  const categorySvc = new CategoryService(db);
  const collectionSvc = new CollectionService(db);
  const variantSvc = new ProductVariantService(db);

  const [products, categories, collections] = await Promise.all([
    productSvc.listAll(),
    categorySvc.list(),
    collectionSvc.list(),
  ]);

  // Varyantlar (ürün başına), koleksiyon üyelikleri ve görsel signed URL'leri paralel çekilir.
  // Görseller R2 private bucket'ta → okuma için imzalı URL. R2 ayarsızsa (getR2 null) placeholder.
  const r2 = getR2();
  const [variantLists, collectionMembers, imageUrls] = await Promise.all([
    Promise.all(products.map((p) => variantSvc.listByProduct(p.id))),
    Promise.all(collections.map((c) => collectionSvc.productIds(c.id))),
    Promise.all(products.map((p) => (r2 && p.imageKey ? r2.getSignedReadUrl(p.imageKey) : Promise.resolve(null)))),
  ]);

  const variantsByProduct = new Map(products.map((p, i) => [p.id, variantLists[i] ?? []]));
  const categoryName = new Map(categories.map((c) => [c.id, resolveLocalizedText(c.name)]));

  // productId → girdiği koleksiyon adları
  const productCollections = new Map<string, string[]>();
  collections.forEach((c, i) => {
    const name = resolveLocalizedText(c.name);
    for (const pid of collectionMembers[i] ?? []) {
      const list = productCollections.get(pid) ?? [];
      list.push(name);
      productCollections.set(pid, list);
    }
  });

  // DB Product'ı TÜRET (& ile) — alanlar yeniden yazılmaz; yalnız türetilmiş/join alanlar eklenir.
  const productViews: ProductView[] = products.map((p, i) => ({
    ...p,
    imageUrl: imageUrls[i] ?? null,
    categoryName: p.categoryId ? (categoryName.get(p.categoryId) ?? '—') : '—',
    variants: variantsByProduct.get(p.id) ?? [],
    collectionNames: productCollections.get(p.id) ?? [],
  }));

  const countByCategory = new Map<string, number>();
  for (const p of products) {
    if (p.categoryId) countByCategory.set(p.categoryId, (countByCategory.get(p.categoryId) ?? 0) + 1);
  }

  const categoryViews: CategoryView[] = categories.map((c) => ({ ...c, count: countByCategory.get(c.id) ?? 0 }));
  const collectionViews: CollectionView[] = collections.map((c, i) => ({ ...c, count: (collectionMembers[i] ?? []).length }));

  const device = await detectDevice();

  return (
    <ProductsClient
      data={{ products: productViews, categories: categoryViews, collections: collectionViews }}
      device={device}
    />
  );
}
