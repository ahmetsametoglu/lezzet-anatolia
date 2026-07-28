import { BundleService, CategoryService, CollectionService, PriceService, ProductService, StockService, serviceDb } from '@lezzet/database';
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

  // OKUMA SEKMEYE BAĞLI. Sayfa dört sekme taşıyor ama hepsi aynı veriye ihtiyaç duymuyor: paket
  // havuzu + fiyat + maliyet okumaları YALNIZ Paketler sekmesinde gerekiyor ve toplamı ~195 KB.
  // Koşulsuz çekilirken Ürünler sekmesini açan operatör hiç kullanmayacağı veriyi ödüyordu. Sorgu
  // SAYISI zaten sabitti (paket başına sorgu yok, kalemler gömülü) — pahalı olan satır GENİŞLİĞİYDİ.
  const needsBundleData = urlState.tab === 'packages';
  // Paketler ürün formunda da gerekli ("bu ürün N pakette kullanılıyor" + pasife alma uyarısı), o
  // yüzden katalog sekmelerinde değil ama Ürünler'de de okunur. Küçük tablo: kürelenmiş kısa bir seçki.
  const needsBundles = needsBundleData || urlState.tab === 'products';

  // Hepsi paralel ve hiçbiri satır sayısıyla ÇOĞALMIYOR (sabit sayıda sorgu).
  const [productPage, counts, categoryCounts, categories, collectionRows, bundleRows, poolRows] = await Promise.all([
    productSvc.listWithRelations({ filters, limit: DEFAULT_PAGE_SIZE }),
    productSvc.counts(filters),
    productSvc.countsByCategory(),
    categorySvc.list(),
    collectionSvc.listWithProductIds(),
    // Paket kalemleri GÖMÜLÜ gelir: liste satırı "N kalem", mutabakat ve marjı onlardan hesaplıyor.
    needsBundles ? new BundleService(db).listWithItems() : Promise.resolve([]),
    // Varyant havuzu — TÜM katalog, süzgeçsiz ama DAR alanlarla (`listPool`). Ürün listesi SÜZGEÇLİ ve
    // SAYFALI olduğu için ondan türetilemez: aramada "börek" yazan operatör pakete baklava ekleyemezdi.
    // Durum süzgeci de YOK: havuz aynı zamanda pakette DURAN kalemin adını çözüyor ve pasif ürünün
    // kalemi de adıyla görünmeli (aktifle sınırlıyken "silinmiş birim" yazıyordu) — `addable` söyler.
    needsBundleData ? productSvc.listPool(VARIANT_POOL_LIMIT) : Promise.resolve([]),
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

  // Fiyat ve MALİYET: paket kurulurken "neyin üstünden indirim veriyorum" ve "bana kaça mal oluyor"
  // sorularının ikisi de cevaplanabilsin. Havuz kimliklerini bekledikleri için paralel bloğun
  // ARDINDAN, ama kendi aralarında paralel ve ikisi de TEK turda (varyant başına sorgu yok).
  const poolVariantIds = poolRows.flatMap((p) => p.variants.map((v) => v.id));
  const [priceRows, unitCosts] = await Promise.all([
    new PriceService(db).findApplicableMap(poolVariantIds, 'b2c'),
    new StockService(db).unitCostMap(poolVariantIds),
  ]);
  const listPrices = new Map(
    [...priceRows].flatMap(([variantId, { channelPrice }]) => (channelPrice ? [[variantId, channelPrice.amount] as const] : [])),
  );

  // Paket kalemi yalnız `variantId` taşır; adı ("Ürün · boy") burada çözülür — client varyant havuzunu
  // tarayıp ad aramaz. İki tüketici de (liste satırı + form seçicisi) AYNI sözlükten okur.
  const variantPool = toVariantOptions(poolRows, listPrices, unitCosts);
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
