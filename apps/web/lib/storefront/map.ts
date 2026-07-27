import { resolvePrice } from '@lezzet/domain-core';
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
 */
export function toProduct(row: ProductRow, locale: Locale, ctx: ProductContext): StorefrontProduct {
  // Fiyat ve stok, ürünün İLK aktif varyantından okunur — çok varyantlıda bu "başlangıç fiyatı"dır.
  const variants = ctx.variants.filter((v) => v.isActive);
  const primary = variants[0];
  const priceRows = primary ? ctx.prices.get(primary.id) : undefined;

  const resolved = primary
    ? resolvePrice({
        channel: 'b2c',
        b2bApproved: false,
        // `Price.amount` euro cinsindendir; motor cent ister (para hesabı tamsayıda yapılır).
        channelPrices: priceRows?.channelPrice ? [{ channel: 'b2c', amountCents: toCents(priceRows.channelPrice.amount) }] : [],
        customerPriceCents: priceRows?.customerPrice ? toCents(priceRows.customerPrice.amount) : null,
        // Teklif (indirim) tanımı henüz yok. STUB(08.10 → 05.6)
        offer: null,
      })
    : null;

  const availableQty = variants.reduce((sum, v) => sum + (ctx.stock.get(v.id)?.availableQty ?? 0), 0);

  return {
    id: row.id,
    slug: row.slug,
    name: resolveLocalizedText(row.name, locale),
    image: imageOf(row),
    unitLabel: primary?.label ?? '',
    // Karşılaştırma fiyatı (kg başına) net ağırlık ister; varyantta o alan yok. STUB(08.10 → 05.10)
    comparisonCents: null,
    priceCents: resolved?.sellable ? resolved.unitPriceCents : null,
    purchaseMode: variants.length > 1 ? 'options' : 'quick',
    soldOut: availableQty <= 0,
  };
}
