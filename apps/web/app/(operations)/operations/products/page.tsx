import { BundleService, CategoryService, CollectionService, ProductFamilyService, ProductService, serviceDb } from '@lezzet/database';
import { DEFAULT_PAGE_SIZE, resolveLocalizedText } from '@lezzet/types';
import { publicImageUrl } from '@lezzet/storage';
import { frameSourcesOf, thumbnailImageUrl } from '@lezzet/application';
import { readWarehouseContext, readWarehouseLabels } from '@/lib/warehouse/context';
import { ProductsClient } from './products-client';
import { readRowSummaries, toBundleViews, toProductViews } from './products-read';
import { parseProductsUrl, RATE_COUNTRIES, toProductFilters } from './products-url';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { guarded, requireAdmin } from '@/lib/guard';
import type { CategoryView, CollectionView, FamilyView } from './products-types';

// Ürünler: okuma burada, satırlar serileştirilebilir view-model'e türetilerek indirilir. Süzme ve keyset sayfalama sunucuda (STACK §6);
// varyantlar ve koleksiyon üyelikleri gömülü seçimle aynı turda gelir, ki sayfa açılışı ürün sayısıyla artmayan sabit sorgu atsın.

interface ProductsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  // Rol kapısı sayfada: layout personeli içeri alır, katalog yönetimi ise yalnız yöneticiye açıktır.
  const access = await guarded(requireAdmin);
  if (!access.ok)
    return (
      <NoAccessPane
        title="Ürünler"
        reason="Katalog yönetimi (ürün, beyan, fiyat tanımı) operasyonun geri kalanına kapalıdır. Bir düzeltme gerekiyorsa yöneticinize iletin."
      />
    );

  const urlState = parseProductsUrl(await searchParams);
  const filters = toProductFilters(urlState);

  const db = serviceDb();
  const productSvc = new ProductService(db);
  const categorySvc = new CategoryService(db);
  const collectionSvc = new CollectionService(db);

  // Paketler özet olarak okunur (`bundle_list_rows()`); kalemleri paket penceresi, partileri satırın kırılımı kendi turunda okur.
  // Depo bağlamı ve adları ürün okumasıyla paralel alınır, çünkü hiçbiri ürün listesini beklemek zorunda değil.
  const [
    productPage,
    { byCategory, ...counts },
    categories,
    collectionRows,
    bundleRows,
    families,
    pinnedPage,
    warehouseCtx,
    warehouseLabels,
    rateGapCounts,
  ] = await Promise.all([
    productSvc.listWithRelations({ filters, limit: DEFAULT_PAGE_SIZE }),
    // Başlık sayaçları ve kategori başına ürün sayısı tek okumada (`product_counts`).
    productSvc.counts(filters),
    categorySvc.list(),
    collectionSvc.listWithProductIds(),
    new BundleService(db).listRows(),
    new ProductFamilyService(db).list(),
    // Seçili ürün (`?p=`) hedefli okunur, çünkü keyset sayfalı listede paylaşılan bağlantının ürünü ilk sayfada olmayabilir.
    urlState.selected ? productSvc.listWithRelations({ filters: { ids: [urlState.selected] }, limit: 1 }) : null,
    readWarehouseContext(),
    readWarehouseLabels(),
    // "Oranı eksik" sayısı öteki süzgeçlerle birlikte sayılır; `product_counts` bu süzgeci taşımaz.
    Promise.all(
      RATE_COUNTRIES.map(
        async (country) => [country, await productSvc.countMatching({ ...filters, missingCountryRate: country })] as const,
      ),
    ),
  ]);

  // Üyeler aile başına okunur: aile operatörün elle kurduğu tavanlı bir kümedir ve tek tur için açılacak kapı yalnız bu ekranı
  // ilgilendirirdi.
  const familyMembers = await Promise.all(families.map((family) => productSvc.listFamilyMembers(family.id)));

  // Ürün indirgemesi eylemle paylaşılır (`products-read`) ki ilk sayfa ve sonrakiler aynı şekli üretsin; koleksiyon adları ürünle
  // gömülü gelen üyelik kimliklerinden çözülür.
  const names = {
    category: new Map(categories.map((c) => [c.id, resolveLocalizedText(c.name)])),
    collection: new Map(collectionRows.map((c) => [c.id, resolveLocalizedText(c.name)])),
  };
  // Satırın stok ve fiyat özetleri `products-read`te kurulur, çünkü sonraki sayfaları getiren eylem de aynı sayıları üretir; hedefli
  // okunan `?p=` ürünü de kümeye girer, yoksa satırı özetsiz kalırdı.
  const summaries = await readRowSummaries(db, [...productPage.rows, ...(pinnedPage?.rows ?? [])], {
    categoryNames: names.category,
    warehouseIds: warehouseCtx.visibleWarehouseIds,
    warehouseLabels,
  });
  const productViews = toProductViews(productPage.rows, names, summaries);

  // Görsel adresi saf birleştirmeyle kurulur ve `?v=<damga>` taşır, dosya değişince adres de değişsin; kategori başına ürün sayısı
  // liste sayfalı olduğu için sunucudan gelir.
  const categoryViews: CategoryView[] = categories.map((c) => ({
    ...c,
    count: byCategory.get(c.id) ?? 0,
    // Özgün dosya düzenleme formunundur; liste hücresi CDN çerçevesini çizer.
    imageUrl: publicImageUrl(c.imageKey, c.imageUpdatedAt),
    frames: frameSourcesOf(c),
  }));

  const collectionViews: CollectionView[] = collectionRows.map((c) => ({
    ...c,
    count: c.productIds.length,
    imageUrl: publicImageUrl(c.imageKey, c.imageUpdatedAt),
    frames: frameSourcesOf(c),
  }));

  const bundleViews = toBundleViews(bundleRows);

  const familyViews: FamilyView[] = families.map((family, index) => {
    const members = familyMembers[index] ?? [];
    return {
      id: family.id,
      name: family.name,
      isActive: family.isActive,
      memberCount: members.length,
      members: members.map((member) => ({
        productId: member.id,
        productName: resolveLocalizedText(member.name),
        // Kısıt etiketi zorunlu kılar ama tip `nullable`; elle yazılmış bir satır kısıtı atlamış olabilir.
        label: member.familyLabel ?? { tr: '', fr: '', de: '' },
        // Yalnız küçük resim olarak çizilir (28–32 px), CDN kare@200.
        imageUrl: thumbnailImageUrl(member),
        status: member.status,
      })),
    };
  });

  return (
    <ProductsClient
      data={{
        products: productViews,
        nextCursor: productPage.nextCursor,
        pinned: pinnedPage ? (toProductViews(pinnedPage.rows, names, summaries)[0] ?? null) : null,
        counts,
        rateGaps: Object.fromEntries(rateGapCounts),
        categories: categoryViews,
        collections: collectionViews,
        bundles: bundleViews,
        families: familyViews,
      }}
      urlState={urlState}
    />
  );
}
