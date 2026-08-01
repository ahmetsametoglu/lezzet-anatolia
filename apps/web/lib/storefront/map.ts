import { resolvePrice } from '@lezzet/domain-core';
import type { ActiveOffer } from '@lezzet/domain-core';
import { pricePerKg, toCents } from '@lezzet/helper';
import { publicImageUrl } from '@lezzet/storage';
import { cropOf, resolveLocalizedText } from '@lezzet/types';
import type { AvailableStockTotal, Category, ImageMeta, Price, Product, ProductVariant } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import type { StorefrontCategory, StorefrontImage, StorefrontProduct, StorefrontVariant } from './storefront-types';

/**
 * DB satırı → vitrin kartı indirgemesi. Anasayfa ve katalog AYNI indirgemeyi kullanır; ayrı yazılsa
 * iki sayfa aynı ürünü farklı gösterebilirdi (no-duplication).
 *
 * Fiyat kararı BU KATMANDA verilmez: satırlar `PriceService`'ten toplu gelir, karar saf motorda
 * (`domain-core/resolvePrice`) — `database` motora bağlanmaz (STACK §4), birleştirme burada yapılır.
 */

/** Görsel künyesini karta indirger — anahtar→URL ve odak/zoom çözümü TEK yerde. */
export function imageOf(row: ImageMeta): StorefrontImage {
  return { url: publicImageUrl(row.imageKey, row.imageUpdatedAt), crop: cropOf(row) };
}

type CategoryRow = Pick<Category, 'id' | 'slug' | 'name'> & ImageMeta;

export function toCategory(row: CategoryRow, locale: Locale): StorefrontCategory {
  return { id: row.id, slug: row.slug, name: resolveLocalizedText(row.name, locale), image: imageOf(row) };
}

/** Ürünün karta indirgenmesi için gereken yan veriler — çağıran toplu okur, kart başına sorgu yok. */
export interface ProductContext {
  variants: ProductVariant[];
  prices: Map<string, { channelPrice: Price | null; customerPrice: Price | null }>;
  /**
   * Kullanılabilir stok. Tip depo-ÜSTÜ olanı (`AvailableStockTotal`) çünkü iki okumadan da
   * beslenir: yer belliyse depo satırı (o tip bunun süpersetidir), belirsizse toplam. Okuyan taraf
   * yalnız `availableQty`ye bakar — hangi okumadan geldiği kararı çağıranındır (DOMAIN §17).
   */
  stock: Map<string, AvailableStockTotal>;
  /** Varyanta açık near-expiry teklifi (partiye bağlı indirim, DOMAIN §5). */
  offers: Map<string, ActiveOffer>;
}

/**
 * Yan verisi olmayan ürün bağlamı — fiyatsız/stoksuz görünür, yani satışa kapalı ve tükendi.
 * Toplu okuma bir ürünü ıskalarsa buraya düşülür; her okuma dosyası kendi boşunu tanımlamasın.
 */
export const EMPTY_PRODUCT_CONTEXT: ProductContext = { variants: [], prices: new Map(), stock: new Map(), offers: new Map() };

/**
 * Tek varyantın satış künyesi — fiyat, kıyas fiyatı, indirim referansı, adet tavanı ve tükendi.
 *
 * Kart da (ilk varyanttan) detay sayfası da (her varyant için) BU indirgemeyi kullanır. Ayrı
 * yazılsalar aynı ürün iki ekranda farklı fiyatlanabilirdi — kartta indirimli, detayda normal gibi.
 *
 * Karar bu katmanda VERİLMEZ: satırlar servisten toplu gelir, fiyatı saf motor çözer
 * (`domain-core/resolvePrice`), burada yalnız motorun cevabı görünüm alanlarına dağıtılır.
 */
function sellingOf(variant: ProductVariant, ctx: ProductContext) {
  const priceRows = ctx.prices.get(variant.id);
  // Motor euro değil cent ister (para hesabı tamsayıda yapılır) — `Price.amount` euro cinsindendir.
  const listCents = priceRows?.channelPrice ? toCents(priceRows.channelPrice.amount) : null;
  const customerCents = priceRows?.customerPrice ? toCents(priceRows.customerPrice.amount) : null;

  const resolved = resolvePrice({
    channel: 'b2c',
    b2bApproved: false,
    channelPrices: listCents != null ? [{ channel: 'b2c', amountCents: listCents }] : [],
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

/** Varyantı detay sayfasının "Boy seçin" kartına indirger (K22). */
export function toVariant(variant: ProductVariant, locale: Locale, ctx: ProductContext): StorefrontVariant {
  const selling = sellingOf(variant, ctx);
  return {
    id: variant.id,
    // Boy etiketi ÇOK DİLLİ ("700 g tepsi" / "plateau 700 g") — burada çözülür, sayfa dil bilmez.
    label: resolveLocalizedText(variant.label, locale),
    netWeightG: variant.netWeightG,
    priceCents: selling.priceCents,
    wasCents: selling.wasCents,
    comparisonCents: selling.comparisonCents,
    limitLabel: selling.limitLabel,
    stockId: selling.stockId,
    soldOut: selling.availableQty <= 0,
  };
}

type ProductRow = Pick<Product, 'id' | 'slug' | 'name'> & ImageMeta;

/**
 * Ürünü vitrin kartına indirger.
 *
 * Fiyat ziyaretçi kanalından (`b2c`) çözülür; giriş yapmış müşterinin kanalı ve özel fiyatı 07/04
 * bağlandığında buraya girer — kart değişmez. Kanal fiyatı YOKSA ürün satışa kapalıdır (DOMAIN §5):
 * `priceCents` null döner, kart fiyat göstermez ve aksiyonu pasifleşir.
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
export function toProduct(row: ProductRow, locale: Locale, ctx: ProductContext): StorefrontProduct {
  // Fiyat, ürünün İLK aktif varyantından okunur — çok varyantlıda bu "başlangıç fiyatı"dır.
  const variants = ctx.variants.filter((v) => v.isActive);
  const primary = variants[0];
  const selling = primary ? sellingOf(primary, ctx) : null;
  // Tükendi kararı kartta ÜRÜN düzeyindedir: bir boyu biten ürün listede tükenmiş görünmemeli.
  const availableQty = variants.reduce((sum, v) => sum + (ctx.stock.get(v.id)?.availableQty ?? 0), 0);

  return {
    id: row.id,
    slug: row.slug,
    name: resolveLocalizedText(row.name, locale),
    image: imageOf(row),
    unitLabel: primary ? resolveLocalizedText(primary.label, locale) : '',
    variantId: primary?.id ?? null,
    stockId: selling?.stockId ?? null,
    comparisonCents: selling?.comparisonCents ?? null,
    priceCents: selling?.priceCents ?? null,
    wasCents: selling?.wasCents,
    limitLabel: selling?.limitLabel ?? null,
    purchaseMode: variants.length > 1 ? 'options' : 'quick',
    soldOut: availableQty <= 0,
  };
}
