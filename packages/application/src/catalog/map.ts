import { resolvePrice } from '@lezzet/domain-core';
import type { ActiveOffer } from '@lezzet/domain-core';
import { pricePerKg } from '@lezzet/helper';
import { publicImageUrl } from '@lezzet/storage';
import { cropOf, resolveLocalizedText } from '@lezzet/types';
import type {
  AvailableStockTotal,
  Category,
  ImageMeta,
  PreferredLanguage,
  Price,
  Product,
  ProductVariant,
  StockStatus,
} from '@lezzet/types';
import type { StorefrontCategory, StorefrontImage, StorefrontProduct, StorefrontVariant } from './storefront-types';
import { VISITOR, type PricingViewer } from './pricing-viewer';

/**
 * DB satırı → vitrin kartı indirgemesi (terfi 21.6; kaynağı `apps/web/lib/storefront/map.ts`).
 *
 * Anasayfa, katalog ve detay AYNI indirgemeyi kullanır; ayrı yazılsa aynı ürün üç ekranda farklı
 * görünebilirdi (no-duplication). Mobil yüzeyin katalog uçları da buraya bağlanacak — bugün
 * ticari bağlamsız çalışıyorlar (fiyat/stok/teklif yok) çünkü bu indirgeme henüz web'deydi.
 *
 * Fiyat kararı BU KATMANDA verilmez: satırlar `PriceService`'ten toplu gelir, karar saf motorda
 * (`domain-core/resolvePrice`) — `database` motora bağlanmaz (STACK §4), birleştirme burada yapılır.
 */

/** Görsel künyesini karta indirger — anahtar→URL ve odak/zoom çözümü TEK yerde. */
export function imageOf(row: ImageMeta): StorefrontImage {
  return { url: publicImageUrl(row.imageKey, row.imageUpdatedAt), crop: cropOf(row) };
}

/**
 * Kategori kartının ihtiyaç duyduğu satır. Dışa VERİLİR çünkü `getCatalogData`'nın yedek kategori
 * parametresi bu şekli bekliyor — çağıranın elindeki listeyi bu tiple imzalaması, yedek ile gerçek
 * satırın ayrışmasını derleme anında yakalar.
 */
export type CatalogCategoryRow = Pick<Category, 'id' | 'slug' | 'name'> & ImageMeta;

export function toCategory(row: CatalogCategoryRow, locale: PreferredLanguage): StorefrontCategory {
  return { id: row.id, slug: row.slug, name: resolveLocalizedText(row.name, locale), image: imageOf(row) };
}

/** Ürünün karta indirgenmesi için gereken yan veriler — çağıran toplu okur, kart başına sorgu yok. */
export interface ProductContext {
  /**
   * **Kim soruyor** — kanal, onay ve kimlik (`pricing-viewer.ts`).
   *
   * Fiyatın çözümü buna bağlı ve bağlam içinde taşınması şart: fiyat SATIRLARI zaten bu kanala
   * göre okundu (`loadProductContext`), yani motora başka bir kanal söylemek elindeki listeyle
   * çelişen bir soru sormak olurdu.
   */
  viewer: PricingViewer;
  variants: ProductVariant[];
  prices: Map<string, { channelPrice: Price | null; customerPrice: Price | null }>;
  /**
   * Kullanılabilir stok. Tip depo-ÜSTÜ olanı (`AvailableStockTotal`) çünkü iki okumadan da
   * beslenir: yer belliyse depo satırı (o tip bunun süpersetidir), belirsizse toplam. Okuyan taraf
   * yalnız `availableQty`ye bakar — hangi okumadan geldiği kararı çağıranındır (DOMAIN §17).
   */
  stock: Map<string, AvailableStockTotal>;
  /**
   * AĞ genelindeki toplam (19.10) — dördüncü hâli ayırmak için.
   *
   * "Yerelde yok + kargoda yok" iki ayrı şey olabilir: ürün başka bir depoda duruyor (soğuk zincir,
   * o bölgeye gitmiyor) ya da hiçbir yerde yok. İlkinin doğru cümlesi "bölgenizde şu an yok" ve
   * yanında "gelince haber ver"; ikincisininki "tükendi". Aynı kelimeyle söylemek, gelmeyecek malı
   * bekletmek ya da gelecek malı kaçırmaktır.
   *
   * `null` = yer bilinmiyor; o hâlde `stock` zaten ağ toplamıdır.
   */
  networkStock: Map<string, AvailableStockTotal> | null;
  /**
   * KARGO deposunun kullanılabiliri (19.10) — `stock`'tan ayrı bir soru.
   *
   * "Yerel depoda yok" tek başına **tükendi demek değildir** (C3): ürün kargo deposunda duruyorsa
   * hâlâ satılabilir, yalnız yolu değişir. Bu harita olmadan yer bilen müşteri, kargoyla
   * gönderebileceğimiz ürünü "Tükendi" görüyordu — sistem müşteriyi tanıdıkça daha az satıyordu.
   *
   * `null` = yer bilinmiyor (o hâlde `stock` zaten ağ-geneli toplam) ya da o ülkeye kargo yok.
   */
  shippingStock: Map<string, AvailableStockTotal> | null;
  /** Varyanta açık near-expiry teklifi (partiye bağlı indirim, DOMAIN §5). */
  offers: Map<string, ActiveOffer>;
}

/**
 * Stok hâlini üç sayıdan ve ürünün kargolanabilirliğinden türetir.
 *
 * Dışa VERİLİR (web'de dosya-içi özeldi): dört hâlin hangi sayıdan doğduğu tek başına sınanabilen
 * bir karardır ve testi de öyle yazılıyor — üç haritanın hepsi doluyken ekrandan geriye doğru
 * okumak, yanlış dalı yeşil gösterirdi.
 */
export function stockStatusOf(
  ctx: ProductContext,
  variantIds: readonly string[],
  shippable: boolean,
): StockStatus {
  const sum = (map: Map<string, AvailableStockTotal> | null): number =>
    map ? variantIds.reduce((total, id) => total + (map.get(id)?.availableQty ?? 0), 0) : 0;

  if (sum(ctx.stock) > 0) return 'available';
  // Kargolanamayan ürün (soğuk zincir) kargo deposunda dursa da o yola giremez.
  if (shippable && sum(ctx.shippingStock) > 0) return 'shipping';
  // Yer bilinmiyorsa `networkStock` null'dur ve `ctx.stock` zaten ağ toplamıydı → buraya
  // düşmek "hiçbir yerde yok" demektir.
  return sum(ctx.networkStock) > 0 ? 'elsewhere' : 'out_of_stock';
}

/**
 * Yan verisi olmayan ürün bağlamı — fiyatsız/stoksuz görünür, yani satışa kapalı ve tükendi.
 * Toplu okuma bir ürünü ıskalarsa buraya düşülür; her okuma dosyası kendi boşunu tanımlamasın.
 */
export const EMPTY_PRODUCT_CONTEXT: ProductContext = {
  // Bağlamı olmayan ürünün fiyatı da yok; ziyaretçi künyesi burada bir varsayım değil, "soruyu
  // soracak kimse yok"un yazılışı.
  viewer: VISITOR,
  variants: [],
  prices: new Map(),
  stock: new Map(),
  shippingStock: null,
  networkStock: null,
  offers: new Map(),
};

/**
 * Tek varyantın satış künyesi — fiyat, kıyas fiyatı, indirim referansı, adet tavanı ve tükendi.
 *
 * Kart da (ilk varyanttan) detay sayfası da (her varyant için) BU indirgemeyi kullanır. Ayrı
 * yazılsalar aynı ürün iki ekranda farklı fiyatlanabilirdi — kartta indirimli, detayda normal gibi.
 *
 * Karar bu katmanda VERİLMEZ: satırlar servisten toplu gelir, fiyatı saf motor çözer
 * (`domain-core/resolvePrice`), burada yalnız motorun cevabı görünüm alanlarına dağıtılır.
 *
 * Dışa VERİLİR: "kartın gösterdiği fiyat" tek bir yerden gelmeli ve o yerin sınanabilir olması
 * gerekiyor — web'de özeldi, terfide kapı açıldı (yalnız okuma; karar yine motorda).
 */
export function sellingOf(variant: ProductVariant, ctx: ProductContext) {
  const priceRows = ctx.prices.get(variant.id);
  // Servis cent döndürür (02.9 · STACK §8) — motorun istediği birim de bu, dönüşüm kalmadı.
  const listCents = priceRows?.channelPrice?.amountCents ?? null;
  const customerCents = priceRows?.customerPrice?.amountCents ?? null;

  const resolved = resolvePrice({
    channel: ctx.viewer.channel,
    b2bApproved: ctx.viewer.b2bApproved,
    // Liste, okunduğu kanalın satırıdır — `viewer.channel` zaten daraltılmış hâl (onaysız şirket
    // B2C'dir), yani motorun kendi daraltması bu listeyle çelişmez.
    channelPrices: listCents != null ? [{ channel: ctx.viewer.channel, amountCents: listCents }] : [],
    customerPriceCents: customerCents,
    offer: ctx.offers.get(variant.id) ?? null,
  });

  const priceCents = resolved.sellable ? resolved.unitPriceCents : null;
  return {
    priceCents,
    // Teklif kazandıysa üstü çizilen, teklifin YERİNE GEÇTİĞİ fiyattır: özel fiyat varsa o, yoksa liste.
    wasCents: resolved.sellable && resolved.source === 'offer' ? (customerCents ?? listCents ?? undefined) : undefined,
    // Kıyas fiyatı ÖDENEN fiyattan hesaplanır (teklif kazandıysa indirimli olandan) — müşteri
    // karşılaştırırken bugün ödeyeceği tutarı kıyaslar. Net ağırlık girilmemişse satır düşer.
    comparisonCents: priceCents != null ? pricePerKg(priceCents, variant.netWeightG) : null,
    // Adet tavanı yalnız teklifte vardır (partide kalan miktar); normal satışta tavan yoktur.
    limitLabel: resolved.sellable && resolved.quantityCap != null ? String(resolved.quantityCap) : null,
    // Teklif kazandıysa kalem O PARTİYE çıpalanır: indirimin sebebi partinin tarihidir, başka
    // partiye taşınmaz (DOMAIN §5). Sepet ve rezervasyon bu kimliği taşır.
    stockId: resolved.sellable ? resolved.stockId : null,
    availableQty: ctx.stock.get(variant.id)?.availableQty ?? 0,
  };
}

/**
 * Varyantı detay sayfasının "Boy seçin" kartına indirger (K22).
 *
 * `shippable` ÜRÜNÜN özelliğidir, varyantın değil — ama karar varyant düzeyinde verilir (bir boy
 * yerelde bitip öteki durabilir), o yüzden çağıran onu geçirir.
 */
export function toVariant(
  variant: ProductVariant,
  locale: PreferredLanguage,
  ctx: ProductContext,
  shippable: boolean,
): StorefrontVariant {
  const selling = sellingOf(variant, ctx);
  const stockStatus = stockStatusOf(ctx, [variant.id], shippable);
  return {
    id: variant.id,
    // Boy etiketi ÇOK DİLLİ ("700 g tepsi" / "plateau 700 g") — burada çözülür, ekran dil bilmez.
    label: resolveLocalizedText(variant.label, locale),
    netWeightG: variant.netWeightG,
    priceCents: selling.priceCents,
    wasCents: selling.wasCents,
    comparisonCents: selling.comparisonCents,
    limitLabel: selling.limitLabel,
    stockId: selling.stockId,
    stockStatus,
    // `soldOut` YALNIZ gerçek tükenmede true — "senin deponda yok" onun cevabı değil.
    // Kargoyla gelebilen ya da başka depoda duran ürün satılabilir kalır (C3).
    soldOut: stockStatus === 'out_of_stock',
  };
}

export type CatalogProductRow = Pick<Product, 'id' | 'slug' | 'name' | 'shippable'> & ImageMeta;

/**
 * Ürünü vitrin kartına indirger.
 *
 * Kanal fiyatı YOKSA ürün satışa kapalıdır (DOMAIN §5): `priceCents` null döner, kart fiyat
 * göstermez ve aksiyonu pasifleşir.
 *
 * `purchaseMode` varyant SAYISINDAN türer: tek varyant listeden eklenir, çok varyantlı detaya
 * götürür (varyant seçimi atlanamaz — `musteri-katalog.md §3`).
 *
 * Tükendi kararı satılabilir varyantların toplam kullanılabilir stoğundan gelir; rezerve edilmiş
 * miktar `availableQty`'de zaten düşülmüştür.
 *
 * Karttaki "Fırsat" hâli near-expiry teklifinden doğar: teklif normal fiyatı YENMİŞSE (motorun
 * kararı) `wasCents` dolar ve kart turuncu etiketi, üstü çizili referansı ve adet sınırını gösterir.
 * Tek fiyat kuralı korunur — üstü çizili değer satın alınabilir bir fiyat değil, referanstır
 * (DOMAIN §5, komponent envanteri K6).
 */
export function toProduct(row: CatalogProductRow, locale: PreferredLanguage, ctx: ProductContext): StorefrontProduct {
  // Fiyat, ürünün İLK aktif varyantından okunur — çok varyantlıda bu "başlangıç fiyatı"dır.
  const variants = ctx.variants.filter((v) => v.isActive);
  const primary = variants[0];
  const selling = primary ? sellingOf(primary, ctx) : null;
  // Stok kararı kartta ÜRÜN düzeyindedir: bir boyu biten ürün listede tükenmiş görünmemeli — bu
  // yüzden hâl tüm aktif varyantların toplamından türer.
  const stockStatus = stockStatusOf(ctx, variants.map((v) => v.id), row.shippable);

  return {
    id: row.id,
    slug: row.slug,
    name: resolveLocalizedText(row.name, locale),
    image: imageOf(row),
    unitLabel: primary ? resolveLocalizedText(primary.label, locale) : '',
    variantId: primary?.id ?? null,
    stockId: selling?.stockId ?? null,
    // Kartın çeşit satırının sayısı — `purchaseMode` ile AYNI kümeden (aktif boylar), ikinci bir
    // sayım yapılmaz ki ikisi bir gün çelişmesin.
    variantCount: variants.length,
    comparisonCents: selling?.comparisonCents ?? null,
    priceCents: selling?.priceCents ?? null,
    wasCents: selling?.wasCents,
    limitLabel: selling?.limitLabel ?? null,
    purchaseMode: variants.length > 1 ? 'options' : 'quick',
    stockStatus,
    // Yalnız GERÇEK tükenmede true (bkz. `StockStatus`).
    soldOut: stockStatus === 'out_of_stock',
  };
}
