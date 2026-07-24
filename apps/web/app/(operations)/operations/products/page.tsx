import {
  CategoryService,
  CollectionService,
  ProductService,
  ProductVariantService,
  serviceDb,
} from '@lezzet/database';
import { resolveLocalizedText, type LocalizedText } from '@lezzet/types';
import { detectDevice } from '@/lib/device';
import { ProductsClient } from './products-client';
import type { CategoryView, CollectionView, LangCode, ProductStatus, ProductView, VariantView } from './products-types';

// Admin katalog yönetimi — Ürünler (Envanter O1 sidebar + O3 sekmeler + O4 tablo + O5/O6 çip/rozet +
// O9 dialog). ProductService/CategoryService/CollectionService'in ilk uçtan uca tüketicisi: veri
// burada (RSC) okunur ve serileştirilebilir view-model'e indirilir; etkileşim client'ta çatallanır.

const LANG_MAP: Array<[LangCode, 'tr' | 'fr' | 'de']> = [
  ['TR', 'tr'],
  ['FR', 'fr'],
  ['DE', 'de'],
];

// Adı DOLU olan dilleri verir — "hangi diller hazır" göstergesi.
function filledLangs(text: LocalizedText): LangCode[] {
  return LANG_MAP.filter(([, key]) => text[key]?.trim()).map(([code]) => code);
}

function statusOf(p: { isCandidate: boolean; isActive: boolean }): ProductStatus {
  if (p.isCandidate) return 'candidate';
  return p.isActive ? 'active' : 'passive';
}

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

  // Varyantlar (ürün başına) ve koleksiyon üyelikleri paralel çekilir.
  const [variantLists, collectionMembers] = await Promise.all([
    Promise.all(products.map((p) => variantSvc.listByProduct(p.id))),
    Promise.all(collections.map((c) => collectionSvc.productIds(c.id))),
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

  const productViews: ProductView[] = products.map((p) => {
    const variants = variantsByProduct.get(p.id) ?? [];
    const variantViews: VariantView[] = variants.map((v) => ({
      id: v.id,
      label: v.label,
      netWeightG: v.netWeightG,
      sku: v.sku,
      isActive: v.isActive,
    }));
    return {
      id: p.id,
      name: resolveLocalizedText(p.name),
      slug: p.slug,
      categoryId: p.categoryId,
      category: p.categoryId ? (categoryName.get(p.categoryId) ?? '—') : '—',
      status: statusOf(p),
      variantCount: variants.length,
      filledLangs: filledLangs(p.name),
      descriptionText: p.description ? resolveLocalizedText(p.description) : '',
      vatRate: p.vatRate,
      dateType: p.dateType,
      shelfLifeDays: p.shelfLifeDays,
      shippable: p.shippable,
      netWeightG: variantViews[0]?.netWeightG ?? null,
      collections: productCollections.get(p.id) ?? [],
      variants: variantViews,
    };
  });

  const countByCategory = new Map<string, number>();
  for (const p of products) {
    if (p.categoryId) countByCategory.set(p.categoryId, (countByCategory.get(p.categoryId) ?? 0) + 1);
  }

  const categoryViews: CategoryView[] = categories.map((c) => ({
    id: c.id,
    name: resolveLocalizedText(c.name),
    slug: c.slug,
    count: countByCategory.get(c.id) ?? 0,
    isActive: c.isActive,
  }));

  const collectionViews: CollectionView[] = collections.map((c, i) => ({
    id: c.id,
    name: resolveLocalizedText(c.name),
    slug: c.slug,
    count: (collectionMembers[i] ?? []).length,
    isActive: c.isActive,
  }));

  const device = await detectDevice();

  return (
    <ProductsClient
      data={{ products: productViews, categories: categoryViews, collections: collectionViews }}
      device={device}
    />
  );
}
