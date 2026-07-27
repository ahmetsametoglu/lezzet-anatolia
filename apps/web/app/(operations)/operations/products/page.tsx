import { CategoryService, CollectionService, ProductService, serviceDb } from '@lezzet/database';
import { DEFAULT_PAGE_SIZE, resolveLocalizedText } from '@lezzet/types';
import { getR2 } from '@lezzet/storage';
import { detectDevice } from '@/lib/device';
import { ProductsClient } from './products-client';
import { toProductViews } from './products-read';
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

  // Hepsi paralel ve hiçbiri satır sayısıyla ÇOĞALMIYOR (sabit sayıda sorgu).
  const [productPage, counts, categoryCounts, categories, collectionRows] = await Promise.all([
    productSvc.listWithRelations({ filters, limit: DEFAULT_PAGE_SIZE }),
    productSvc.counts(filters),
    productSvc.countsByCategory(),
    categorySvc.list(),
    collectionSvc.listWithProductIds(),
  ]);

  // Görseller R2 private bucket'ta → okuma için imzalı URL (imzalama yerel; ağ turu değil).
  // Not: (05.11) public bucket'a geçince bu katman saf string birleştirmeye iner.
  const r2 = getR2();
  const signed = (key: string | null): Promise<string | null> => (r2 && key ? r2.getSignedReadUrl(key) : Promise.resolve(null));
  const [categoryImageUrls, collectionImageUrls] = await Promise.all([
    Promise.all(categories.map((c) => signed(c.imageKey))),
    Promise.all(collectionRows.map((c) => signed(c.imageKey))),
  ]);

  // Ürün indirgemesi action ile PAYLAŞILIR (products-read) — ilk sayfa ve sonraki sayfalar aynı şekli
  // üretsin diye. Koleksiyon ADLARI üyelik id'lerinden çözülür; id'ler ürünle gömülü geldi (join yok).
  const names = {
    category: new Map(categories.map((c) => [c.id, resolveLocalizedText(c.name)])),
    collection: new Map(collectionRows.map((c) => [c.id, resolveLocalizedText(c.name)])),
  };
  const productViews = await toProductViews(productPage.rows, names);

  // Kategori başına ürün sayısı: liste sayfalı olduğu için client'ta türetilemez → sunucudan gelir.
  const categoryViews: CategoryView[] = categories.map((c, i) => ({
    ...c,
    count: categoryCounts.get(c.id) ?? 0,
    imageUrl: categoryImageUrls[i] ?? null,
  }));

  const collectionViews: CollectionView[] = collectionRows.map((c, i) => ({
    ...c,
    count: c.productIds.length,
    imageUrl: collectionImageUrls[i] ?? null,
  }));

  const device = await detectDevice();

  return (
    <ProductsClient
      data={{
        products: productViews,
        nextCursor: productPage.nextCursor,
        counts,
        categories: categoryViews,
        collections: collectionViews,
      }}
      device={device}
      urlState={urlState}
    />
  );
}
