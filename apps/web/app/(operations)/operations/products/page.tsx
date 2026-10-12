import { BundleService, CategoryService, CollectionService, ProductFamilyService, ProductService, serviceDb } from '@lezzet/database';
import { DEFAULT_PAGE_SIZE, resolveLocalizedText } from '@lezzet/types';
import { publicImageUrl } from '@lezzet/storage';
import { frameSourcesOf, thumbnailImageUrl } from '@lezzet/application';
import { readWarehouseContext, readWarehouseLabels } from '@/lib/warehouse/context';
import { ProductsClient } from './products-client';
import { readRowSummaries, toBundleViews, toProductViews } from './products-read';
import { parseProductsUrl, toProductFilters } from './products-url';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { guarded, requireAdmin } from '@/lib/guard';
import type { CategoryView, CollectionView, FamilyView } from './products-types';

// Admin katalog yönetimi — Ürünler. Okuma burada (RSC) yapılır, DB satırları serileştirilebilir
// view-model'e (& ile TÜRETİLEREK) indirilir; yalnız türetilmiş/join alanlar eklenir.
//
// SÜZME VE SAYFALAMA SUNUCUDA (STACK §6): süzgeçler URL'den okunur ve servise parametre olarak iner;
// client tam listeyi çekip filtrelemez. Ürünler keyset sayfalı gelir (ilk sayfa + imleç), devamını
// client action ile ekler. Kategori ve koleksiyon TAM gelir — tavanı onlarla sınırlı ve açılır
// menüleri besliyor.
//
// N+1 YOK: varyantlar ve koleksiyon üyelikleri gömülü `select` ile aynı turda gelir (ürün başına ayrı
// sorgu değil). Sayfa açılışı SABİT sayıda sorgu atar; ürün sayısıyla artmaz.

interface ProductsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  // Rol kapısı SAYFADA: layout personeli içeri alır, katalog yönetimi ise personelin bir ALT
  // KÜMESİNE açıktır — ray da öyle diyor (`ops-nav`: bu bağlantı yalnız yöneticiye çizilir).
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

  // Paketler ÖZET olarak okunur (`bundle_list_rows()`): satır başına kaç kalem, atanmış toplam, "ayrı
  // ayrı alınsa", maliyet, KDV'siz gelir. Kalemlerin kendisi burada YOK — onlar paket diyaloğu
  // açılınca, yalnız o paket için okunur. PARTİLER de gelmez: son tarih satır açılınca, o boyların
  // kendi turunda okunur. Ürün formu bu satırlardan besleniyor ("bu ürün N pakette kullanılıyor").
  //
  // Depo bağlamı ve depo adları ürün okumasıyla PARALEL alınır: satırın stok özeti ikisine de bağlı
  // ama hiçbiri ürün listesini beklemek zorunda değil.
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
  ] = await Promise.all([
    productSvc.listWithRelations({ filters, limit: DEFAULT_PAGE_SIZE }),
    // Dört sayı TEK okumada (`product_counts`): başlık sayaçları + kategori başına ürün sayısı.
    productSvc.counts(filters),
    categorySvc.list(),
    collectionSvc.listWithProductIds(),
    new BundleService(db).listRows(),
    new ProductFamilyService(db).list(),
    // SEÇİLİ ürün (`?p=`) HEDEFLİ okunur (16.08): liste keyset sayfalı — paylaşılan bağlantının
    // ürünü ilk sayfada olmayabilir ve önizleme o zaman sessizce İLK satırı gösterirdi (URL başka
    // ürünü söylerken). Tek satırlık ek okuma; parametre yokken hiç yapılmaz.
    urlState.selected ? productSvc.listWithRelations({ filters: { ids: [urlState.selected] }, limit: 1 }) : null,
    readWarehouseContext(),
    readWarehouseLabels(),
  ]);

  // Üyeler aile başına okunuyor. **N+1 ama bilinçli:** aile operatörün elle kurduğu, doğal tavanlı
  // bir küme (`CLAUDE §1`) — bugün bir avuç, yarın birkaç düzine. Tek turda okumak için ürün
  // servisine "ailesi olan hepsi" diye bir kapı açmak gerekirdi ve o kapı yalnız bu ekranı
  // ilgilendiriyor. Sayı büyürse kapı istenir, bugün istenmez.
  const familyMembers = await Promise.all(families.map((family) => productSvc.listFamilyMembers(family.id)));

  // Ürün indirgemesi action ile PAYLAŞILIR (products-read) — ilk sayfa ve sonraki sayfalar aynı şekli
  // üretsin diye. Koleksiyon ADLARI üyelik id'lerinden çözülür; id'ler ürünle gömülü geldi (join yok).
  const names = {
    category: new Map(categories.map((c) => [c.id, resolveLocalizedText(c.name)])),
    collection: new Map(collectionRows.map((c) => [c.id, resolveLocalizedText(c.name)])),
  };
  // Satırın stok ve fiyat özetleri — kurulum `products-read`te, çünkü sonraki sayfaları getiren
  // action da aynı sayıları üretmek zorunda. Hedefli okunan `?p=` ürünü de kümeye girer, yoksa
  // paylaşılan bağlantının satırı özetsiz kalırdı.
  const summaries = await readRowSummaries(db, [...productPage.rows, ...(pinnedPage?.rows ?? [])], {
    categoryNames: names.category,
    warehouseIds: warehouseCtx.visibleWarehouseIds,
    warehouseLabels,
  });
  const productViews = toProductViews(productPage.rows, names, summaries);

  // Görsel URL'i public bucket'tan saf birleştirmeyle kurulur (05.11) — ne async çağrı ne ağ turu;
  // `?v=<damga>` sayesinde dosya değişince adres de değişir, arada tam cache.
  // Kategori başına ürün sayısı: liste sayfalı olduğu için client'ta türetilemez → sunucudan gelir.
  const categoryViews: CategoryView[] = categories.map((c) => ({
    ...c,
    count: byCategory.get(c.id) ?? 0,
    // Özgün dosya düzenleme formunun; liste hücresi CDN çerçevesini çizer (05.37).
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
        // Kısıt doluyken etiketi zorunlu kılıyor, ama tip `nullable` — okuma tarafı boşu da
        // karşılayabilmeli (elle SQL'le yazılmış bir satır kısıtı atlamış olabilir).
        label: member.familyLabel ?? { tr: '', fr: '', de: '' },
        // Yalnız küçük resim olarak çiziliyor (28–32 px) — CDN kare@200 (05.37).
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
        categories: categoryViews,
        collections: collectionViews,
        bundles: bundleViews,
        families: familyViews,
      }}
      urlState={urlState}
    />
  );
}
