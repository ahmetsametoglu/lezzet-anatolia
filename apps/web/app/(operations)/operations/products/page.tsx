import { BundleService, CategoryService, CollectionService, ProductFamilyService, ProductService, serviceDb } from '@lezzet/database';
import { DEFAULT_PAGE_SIZE, resolveLocalizedText } from '@lezzet/types';
import { publicImageUrl } from '@lezzet/storage';
import { ProductsClient } from './products-client';
import { toBundleViews, toProductViews } from './products-read';
import { parseProductsUrl, toProductFilters } from './products-url';
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
  const urlState = parseProductsUrl(await searchParams);
  const filters = toProductFilters(urlState);

  const db = serviceDb();
  const productSvc = new ProductService(db);
  const categorySvc = new CategoryService(db);
  const collectionSvc = new CollectionService(db);

  // Paketler ÖZET olarak okunur (`bundle_list_rows()`): satır başına kaç kalem, atanmış toplam, "ayrı
  // ayrı alınsa", maliyet, KDV'siz gelir. Kalemlerin kendisi burada YOK — onlar paket diyaloğu
  // açılınca, yalnız o paket için okunur. Fiyat ve parti verisi de sayfaya hiç gelmez: listenin
  // ihtiyacı birkaç sayı, oysa uygulamada hesaplamak katalogun tamamını taşımayı gerektiriyordu.
  // Ürün formu da bu satırlardan besleniyor ("bu ürün N pakette kullanılıyor" — `variantIds`).
  const [productPage, { byCategory, ...counts }, categories, collectionRows, bundleRows, families, pinnedPage] = await Promise.all([
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
  const productViews = toProductViews(productPage.rows, names);

  // Görsel URL'i public bucket'tan saf birleştirmeyle kurulur (05.11) — ne async çağrı ne ağ turu;
  // `?v=<damga>` sayesinde dosya değişince adres de değişir, arada tam cache.
  // Kategori başına ürün sayısı: liste sayfalı olduğu için client'ta türetilemez → sunucudan gelir.
  const categoryViews: CategoryView[] = categories.map((c) => ({
    ...c,
    count: byCategory.get(c.id) ?? 0,
    imageUrl: publicImageUrl(c.imageKey, c.imageUpdatedAt),
  }));

  const collectionViews: CollectionView[] = collectionRows.map((c) => ({
    ...c,
    count: c.productIds.length,
    imageUrl: publicImageUrl(c.imageKey, c.imageUpdatedAt),
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
        imageUrl: publicImageUrl(member.imageKey, member.imageUpdatedAt),
        status: member.status,
      })),
    };
  });

  return (
    <ProductsClient
      data={{
        products: productViews,
        nextCursor: productPage.nextCursor,
        pinned: pinnedPage ? (toProductViews(pinnedPage.rows, names)[0] ?? null) : null,
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
