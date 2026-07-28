import { BundleService, CategoryService, CollectionService, ProductService, serviceDb } from '@lezzet/database';
import { DEFAULT_PAGE_SIZE, resolveLocalizedText } from '@lezzet/types';
import { publicImageUrl } from '@lezzet/storage';
import { detectDevice } from '@/lib/device';
import { ProductsClient } from './products-client';
import { toBundleViews, toProductViews } from './products-read';
import { parseProductsUrl, toProductFilters } from './products-url';
import type { CategoryView, CollectionView } from './products-types';

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
  const [productPage, { byCategory, ...counts }, categories, collectionRows, bundleRows] = await Promise.all([
    productSvc.listWithRelations({ filters, limit: DEFAULT_PAGE_SIZE }),
    // Dört sayı TEK okumada (`product_counts`): başlık sayaçları + kategori başına ürün sayısı.
    productSvc.counts(filters),
    categorySvc.list(),
    collectionSvc.listWithProductIds(),
    new BundleService(db).listRows(),
  ]);

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

  const device = await detectDevice();

  return (
    <ProductsClient
      data={{
        products: productViews,
        nextCursor: productPage.nextCursor,
        counts,
        categories: categoryViews,
        collections: collectionViews,
        bundles: bundleViews,
      }}
      device={device}
      urlState={urlState}
    />
  );
}
