import { percentOffCents, resolvePrice } from '@lezzet/domain-core';
import type { ActiveOffer } from '@lezzet/domain-core';
import { comparisonPrice } from '@lezzet/helper';
import { cdnImageUrl, publicImageUrl } from '@lezzet/storage';
import {
  CROP_CENTER,
  cropOf,
  cropTrim,
  FRAME_RATIOS,
  IMAGE_WIDTHS,
  resolveLocalizedText,
  srcSetOf,
  type FrameKey,
  type ImageRender,
  type ImageWidth,
  type SrcSetEntry,
} from '@lezzet/types';
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
import type { ScopeCampaign } from './campaign';
import type { ImageFrameSources, StorefrontCategory, StorefrontImage, StorefrontProduct, StorefrontVariant } from './storefront-types';
import { rotateDaily } from './featured';
import { VISITOR, type PricingViewer } from './pricing-viewer';

/**
 * DB satırından vitrin kartına indirgeme; anasayfa, katalog, detay ve mobil aynı indirgemeyi kullanır. Fiyat kararı motordadır
 * (`resolvePrice`), satırlar servisten toplu gelir.
 */

/** Görsel künyesini karta indirger — anahtar→URL, odak/zoom ve CDN türevleri TEK yerde. */
export function imageOf(row: ImageMeta): StorefrontImage {
  return { url: publicImageUrl(row.imageKey, row.imageUpdatedAt), crop: cropOf(row), frames: frameSourcesOf(row) };
}

/** Görseli çözülemeyen satırın yer tutucusu — vitrin, sepet ve sipariş kapılarının ortak son çaresi. */
export const EMPTY_IMAGE: StorefrontImage = { url: null, crop: CROP_CENTER, frames: null };

/**
 * Çerçevenin tek adresi (`src`) hangi basamaktan: `srcset` okumayan istemci ve paylaşım kartı içindir; 1200 paylaşım
 * kartının önerilen ölçüsüdür.
 */
const FRAME_SRC_WIDTH: Record<FrameKey, ImageWidth> = {
  source: 800,
  square: 800,
  band: 1200,
  illustration: 800,
  chat: 1200,
  portrait: 800,
  wide: 1200,
};

/**
 * Tek çerçevenin tek basamağı: kadraj (`cropTrim`) + ölçü. Çerçeve kümesi de küçük resim de BURADAN
 * geçer — aynı çerçeve ve basamak her yerde aynı adresi üretir, Cloudflare onu tek dönüşüm sayar.
 */
function frameStepUrl(row: ImageRender, key: FrameKey, width: ImageWidth): string | null {
  const trim = cropTrim({ width: row.imageWidth, height: row.imageHeight }, FRAME_RATIOS[key], cropOf(row));
  return trim ? cdnImageUrl(row.imageKey, row.imageUpdatedAt, { width, trim, format: 'auto' }) : null;
}

/**
 * Çerçeve başına CDN kaynakları: odak+zoom kadrajı `cropTrim` ile kesire çevrilir, web ve native aynı adresleri alır.
 * CDN yoksa ya da kaynak ölçüsü bilinmiyorsa `null`, çağıran `url` + CSS ile aynı kareyi çizer.
 */
export function frameSourcesOf(row: ImageRender): ImageFrameSources | null {
  const out: Partial<ImageFrameSources> = {};
  for (const key of Object.keys(FRAME_RATIOS) as FrameKey[]) {
    const basamaklar: SrcSetEntry[] = [];
    for (const width of IMAGE_WIDTHS) {
      const url = frameStepUrl(row, key, width);
      if (!url) return null;
      basamaklar.push({ width, url });
    }
    out[key] = {
      src: basamaklar.find((b) => b.width === FRAME_SRC_WIDTH[key])!.url,
      // Biçimin tek tanımı `srcSetOf`; native `frameUrlFor` aynı metni açar.
      srcSet: srcSetOf(basamaklar),
    };
  }
  return out as ImageFrameSources;
}

/**
 * Küçük resim: kare çerçevenin 200 px basamağı, operatörün kadrajıyla; müşteri yüzeyinin kare@200 adresiyle aynı ki önbellek
 * paylaşılsın. CDN ya da kaynak ölçüsü yoksa özgün dosya.
 */
export function thumbnailImageUrl(row: ImageRender): string | null {
  return frameStepUrl(row, 'square', IMAGE_WIDTHS[0]) ?? publicImageUrl(row.imageKey, row.imageUpdatedAt);
}

/**
 * Kategori kartının ihtiyaç duyduğu satır. Dışa VERİLİR çünkü `getCatalogData`'nın yedek kategori
 * parametresi bu şekli bekliyor — çağıranın elindeki listeyi bu tiple imzalaması, yedek ile gerçek
 * satırın ayrışmasını derleme anında yakalar.
 */
export type CatalogCategoryRow = Pick<Category, 'id' | 'slug' | 'name'> & ImageMeta;

/**
 * Kategori kartı: görsel havuzdan (kapak + ek fotoğraflar) güne göre seçilir (`rotateDaily`), çünkü rastgele seçim
 * önbelleği kırar ve paylaşım kartı ile sayfa ayrışırdı. Havuz boşsa kapak.
 */
export function toCategory(
  row: CatalogCategoryRow,
  locale: PreferredLanguage,
  pool?: readonly ImageMeta[],
  now?: Date,
): StorefrontCategory {
  const faces = [row, ...(pool ?? [])].filter((face) => face.imageKey !== null);
  const face = rotateDaily(faces, 1, now)[0] ?? row;
  return { id: row.id, slug: row.slug, name: resolveLocalizedText(row.name, locale), image: imageOf(face) };
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
   * Kullanılabilir stok; yer belliyse depo satırı, belirsizse depo-üstü toplam.
   */
  stock: Map<string, AvailableStockTotal>;
  /**
   * Ağ genelindeki toplam: "bölgenizde şu an yok" ile "tükendi" ayrımı için. `null` yer bilinmiyor, `stock` zaten ağ toplamıdır.
   */
  networkStock: Map<string, AvailableStockTotal> | null;
  /**
   * Kargo deposunun kullanılabiliri; yerel depoda yok tek başına tükendi demek değildir. `null` yer bilinmiyor ya da kargo yok.
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
 * Bu hâl müşterinin yerine teslim edilebilir mi: yerel stok ya da kargo; öneri, görüntüleme defteri ve ajan araçları aynı soruyu sorar.
 */
export function deliversHere(status: StockStatus): boolean {
  return status === 'available' || status === 'shipping';
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
 * Kıyas fiyatı ve BİRİMİ birlikte doğar — sayıyı birimsiz taşımak, sıvıyı "€/kg" diye yazan bir ekranı mümkün kılardı.
 * Miktar, birim ya da fiyat yoksa ikisi de `null` olur ve satır hiç çizilmez (uydurma kıyas, kıyassızlıktan kötüdür).
 */
function comparisonOf(priceCents: number | null, variant: Pick<ProductVariant, 'netQuantity' | 'netUnit'>) {
  const comparison = priceCents === null ? null : comparisonPrice(priceCents, variant.netQuantity, variant.netUnit);
  return { comparisonCents: comparison?.cents ?? null, comparisonUnit: comparison?.per ?? null };
}

/**
 * Tek varyantın satış künyesi (fiyat, kıyas, indirim referansı, tavan, tükendi); kart ve detay aynı indirgemeyi kullanır
 * ki aynı ürün iki ekranda farklı fiyatlanmasın. Karar motordadır.
 */
export function sellingOf(variant: ProductVariant, ctx: ProductContext) {
  const priceRows = ctx.prices.get(variant.id);
  // Servis cent döndürür (STACK §8).
  const listCents = priceRows?.channelPrice?.amountCents ?? null;
  const customerCents = priceRows?.customerPrice?.amountCents ?? null;

  const resolved = resolvePrice({
    channel: ctx.viewer.channel,
    b2bApproved: ctx.viewer.b2bApproved,
    // Liste, okunduğu kanalın satırıdır — `viewer.channel` zaten daraltılmış hâl (onaysız şirket
    // B2C'dir), yani motorun kendi daraltması bu listeyle çelişmez.
    channelPrices: listCents != null ? [{ channel: ctx.viewer.channel, amountCents: listCents }] : [],
    customerPriceCents: customerCents,
    // Grup yüzdesi viewer'da çözülmüş gelir, fiyata motor uygular.
    groupPercentOff: ctx.viewer.groupPercentOff,
    offer: ctx.offers.get(variant.id) ?? null,
  });

  const priceCents = resolved.sellable ? resolved.unitPriceCents : null;
  // Teklifin yerine geçtiği fiyat, motorun teklifsiz vereceği fiyattır: özel → grup → liste.
  const withoutOffer =
    customerCents ??
    (ctx.viewer.channel === 'b2b' && ctx.viewer.groupPercentOff != null && listCents != null
      ? percentOffCents(listCents, ctx.viewer.groupPercentOff)
      : listCents);
  return {
    priceCents,
    // Teklif kazandıysa üstü çizilen, teklifin YERİNE GEÇTİĞİ fiyattır.
    wasCents: resolved.sellable && resolved.source === 'offer' ? (withoutOffer ?? undefined) : undefined,
    // Kıyas fiyatı ÖDENEN fiyattan hesaplanır (teklif kazandıysa indirimli olandan) — müşteri
    // karşılaştırırken bugün ödeyeceği tutarı kıyaslar. Net miktar girilmemişse satır düşer.
    ...comparisonOf(priceCents, variant),
    // Adet tavanı yalnız teklifte vardır (partide kalan miktar); normal satışta tavan yoktur.
    limitLabel: resolved.sellable && resolved.quantityCap != null ? String(resolved.quantityCap) : null,
    // Teklif kazandıysa kalem O PARTİYE çıpalanır: indirimin sebebi partinin tarihidir, başka
    // partiye taşınmaz (DOMAIN §5). Sepet ve rezervasyon bu kimliği taşır.
    stockId: resolved.sellable ? resolved.stockId : null,
    availableQty: ctx.stock.get(variant.id)?.availableQty ?? 0,
  };
}

/**
 * Ürünün birincil boyu: en ucuz satılabilir boy, çünkü operatör sırası fiyatı bilmez ve kart ucuz boyu gizlerdi. Fiyatı
 * olmayan boy birincil olamaz; eşitlikte gelen sıra korunur (`0032` tie-breaker'ı ile aynı).
 */
export function primaryVariantOf(variants: readonly ProductVariant[], ctx: ProductContext): ProductVariant | null {
  let best: ProductVariant | null = null;
  let bestCents: number | null = null;
  for (const variant of variants) {
    const cents = sellingOf(variant, ctx).priceCents;
    if (cents == null) continue;
    if (bestCents == null || cents < bestCents) {
      best = variant;
      bestCents = cents;
    }
  }
  return best ?? variants[0] ?? null;
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
    piecesCount: variant.piecesCount ?? null,
    portionKind: variant.portionKind ?? null,
    netQuantity: variant.netQuantity,
    netUnit: variant.netUnit,
    priceCents: selling.priceCents,
    wasCents: selling.wasCents,
    comparisonCents: selling.comparisonCents,
    comparisonUnit: selling.comparisonUnit,
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
 * Ürünü vitrin kartına indirger: kanal fiyatı yoksa satışa kapalı, `purchaseMode` varyant sayısından, tükendi toplam
 * kullanılabilirden. "Fırsat" hâli teklif normal fiyatı yendiğinde `wasCents`ten doğar; üstü çizili değer bir referanstır.
 */
export function toProduct(
  row: CatalogProductRow,
  locale: PreferredLanguage,
  ctx: ProductContext,
  /**
   * Ürünün kapsam kampanyası; `null` yok ya da kesit başlığı zaten söylüyor, ayrımı çağıran yapar.
   */
  campaign: ScopeCampaign | null = null,
  /**
   * Yalnız burada duran boylar: araç bir vitrin değil yüktür (DOMAIN §17), boy sayısı ve satın alma kipi araçtaki kümeden türer.
   */
  onlyStockedHere = false,
): StorefrontProduct {
  // Fiyat en ucuz aktif boydan (`primaryVariantOf`); çok boyluda bu başlangıç fiyatıdır.
  const aktif = ctx.variants.filter((v) => v.isActive);
  const variants = onlyStockedHere ? aktif.filter((v) => (ctx.stock?.get(v.id)?.availableQty ?? 0) > 0) : aktif;
  const primary = primaryVariantOf(variants, ctx);
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
    // Ürünün DOĞASI, yerin değil: stok hâli "bu adrese gider mi" der, bu "kargoyla hiç gider mi".
    // Satırdan aynen geçiyor — `stockStatusOf` de aynı değeri okuyor, ikinci bir kaynak yok.
    shippable: row.shippable,
    comparisonCents: selling?.comparisonCents ?? null,
    comparisonUnit: selling?.comparisonUnit ?? null,
    priceCents: selling?.priceCents ?? null,
    wasCents: selling?.wasCents,
    limitLabel: selling?.limitLabel ?? null,
    purchaseMode: variants.length > 1 ? 'options' : 'quick',
    stockStatus,
    // Yalnız GERÇEK tükenmede true (bkz. `StockStatus`).
    soldOut: stockStatus === 'out_of_stock',
    /* Fırsat kampanyayı yener: fırsat birim fiyatta kesin düşüştür, kapsam kampanyası sepete bağlıdır. Karar burada ki her
       yüzey aynı `if`i yazmasın. */
    campaign: selling?.wasCents === undefined ? campaign : null,
  };
}
