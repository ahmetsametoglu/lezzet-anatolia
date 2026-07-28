import { BundleService, CategoryService, CollectionService, PriceService, ProductService, serviceDb } from '@lezzet/database';
import { DEFAULT_PAGE_SIZE, resolveLocalizedText } from '@lezzet/types';
import { publicImageUrl } from '@lezzet/storage';
import { detectDevice } from '@/lib/device';
import { ProductsClient } from './products-client';
import { toBundleViews, toProductViews, toVariantOptions } from './products-read';
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

// Paket seçicisinin havuz tavanı. Katalog bunu aşarsa seçici aramalı bir sunucu okumasına dönüşür;
// o gün gelene kadar tek sorgu yeterli ve sayfa açılışı sabit sorgu sayısında kalır.
const VARIANT_POOL_LIMIT = 500;

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
  const [productPage, counts, categoryCounts, categories, collectionRows, bundleRows, variantPoolRows] = await Promise.all([
    productSvc.listWithRelations({ filters, limit: DEFAULT_PAGE_SIZE }),
    productSvc.counts(filters),
    productSvc.countsByCategory(),
    categorySvc.list(),
    collectionSvc.listWithProductIds(),
    // Paket kalemleri GÖMÜLÜ gelir: liste satırı "N kalem" ve mutabakat rozetini onlardan hesaplıyor.
    new BundleService(db).listWithItems(),
    // Varyant havuzu — TÜM katalog, süzgeçsiz. Ürün listesi SÜZGEÇLİ ve SAYFALI olduğu için ondan
    // türetilemez: aramada "börek" yazan operatör pakete baklava ekleyemezdi. Durum süzgeci de YOK:
    // havuz aynı zamanda pakette DURAN kalemin adını çözüyor ve pasif ürünün kalemi de adıyla
    // görünmeli (aktifle sınırlıyken "silinmiş birim" yazıyordu). Eklenebilirlik `addable` alanında.
    productSvc.listWithRelations({ limit: VARIANT_POOL_LIMIT }),
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
    count: categoryCounts.get(c.id) ?? 0,
    imageUrl: publicImageUrl(c.imageKey, c.imageUpdatedAt),
  }));

  const collectionViews: CollectionView[] = collectionRows.map((c) => ({
    ...c,
    count: c.productIds.length,
    imageUrl: publicImageUrl(c.imageKey, c.imageUpdatedAt),
  }));

  // Liste fiyatları (b2c, KDV dahil): paketin verdiği indirim ancak bunlara göre gösterilebilir —
  // operatör 34,90'ı neyin üstünden verdiğini görmeden yazıyordu. Havuz kimliklerini beklediği için
  // paralel bloğun ARDINDAN okunur, ama tek turda: `findApplicableMap` varyant başına sorgu atmaz.
  const poolVariantIds = variantPoolRows.rows.flatMap((p) => p.variants.map((v) => v.id));
  const priceRows = await new PriceService(db).findApplicableMap(poolVariantIds, 'b2c');
  const listPrices = new Map(
    [...priceRows].flatMap(([variantId, { channelPrice }]) => (channelPrice ? [[variantId, channelPrice.amount] as const] : [])),
  );

  // Paket kalemi yalnız `variantId` taşır; adı ("Ürün · boy") burada çözülür — client varyant havuzunu
  // tarayıp ad aramaz. İki tüketici de (liste satırı + form seçicisi) AYNI sözlükten okur.
  const variantPool = toVariantOptions(variantPoolRows.rows, listPrices);
  const variantLabels = new Map(variantPool.map((v) => [v.variantId, v.label]));
  const bundleViews = toBundleViews(bundleRows, variantLabels);

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
        variantPool,
      }}
      device={device}
      urlState={urlState}
    />
  );
}
