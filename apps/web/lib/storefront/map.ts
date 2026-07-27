import { resolvePrice } from '@lezzet/domain-core';
import type { ActiveOffer } from '@lezzet/domain-core';
import { toCents } from '@lezzet/helper';
import { publicImageUrl } from '@lezzet/storage';
import { cropOf, resolveLocalizedText } from '@lezzet/types';
import type { AvailableStock, Category, ImageMeta, Price, Product, ProductVariant } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import type { StorefrontCategory, StorefrontImage, StorefrontProduct } from './storefront-types';

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
  stock: Map<string, AvailableStock>;
  /** Varyanta açık near-expiry teklifi (partiye bağlı indirim, DOMAIN §5). */
  offers: Map<string, ActiveOffer>;
}

/**
 * Yan verisi olmayan ürün bağlamı — fiyatsız/stoksuz görünür, yani satışa kapalı ve tükendi.
 * Toplu okuma bir ürünü ıskalarsa buraya düşülür; her okuma dosyası kendi boşunu tanımlamasın.
 */
export const EMPTY_PRODUCT_CONTEXT: ProductContext = { variants: [], prices: new Map(), stock: new Map(), offers: new Map() };

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
  // Fiyat ve stok, ürünün İLK aktif varyantından okunur — çok varyantlıda bu "başlangıç fiyatı"dır.
  const variants = ctx.variants.filter((v) => v.isActive);
  const primary = variants[0];
  const priceRows = primary ? ctx.prices.get(primary.id) : undefined;
  // Motor euro değil cent ister (para hesabı tamsayıda yapılır) — `Price.amount` euro cinsindendir.
  const listCents = priceRows?.channelPrice ? toCents(priceRows.channelPrice.amount) : null;
  const customerCents = priceRows?.customerPrice ? toCents(priceRows.customerPrice.amount) : null;

  const resolved = primary
    ? resolvePrice({
        channel: 'b2c',
        b2bApproved: false,
        channelPrices: listCents != null ? [{ channel: 'b2c', amountCents: listCents }] : [],
        customerPriceCents: customerCents,
        offer: ctx.offers.get(primary.id) ?? null,
      })
    : null;

  const availableQty = variants.reduce((sum, v) => sum + (ctx.stock.get(v.id)?.availableQty ?? 0), 0);
  // Teklif kazandıysa üstü çizilen, teklifin YERİNE GEÇTİĞİ fiyattır: özel fiyat varsa o, yoksa liste.
  const isOffer = resolved?.sellable === true && resolved.source === 'offer';
  const wasCents = isOffer ? (customerCents ?? listCents ?? undefined) : undefined;

  return {
    id: row.id,
    slug: row.slug,
    name: resolveLocalizedText(row.name, locale),
    image: imageOf(row),
    unitLabel: primary?.label ?? '',
    // Karşılaştırma fiyatı (kg başına) net ağırlık ister; varyantta o alan yok. STUB(08.10 → 05.10)
    comparisonCents: null,
    priceCents: resolved?.sellable ? resolved.unitPriceCents : null,
    wasCents,
    // Adet sınırı yalnız teklifte vardır (partide kalan miktar); normal satışta tavan yoktur.
    limitLabel: resolved?.sellable && resolved.quantityCap != null ? String(resolved.quantityCap) : null,
    purchaseMode: variants.length > 1 ? 'options' : 'quick',
    soldOut: availableQty <= 0,
  };
}
