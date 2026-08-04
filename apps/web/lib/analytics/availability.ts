import type { AnalyticsAvailability } from '@lezzet/types';
import type { StorefrontVariant } from '@/lib/storefront/storefront-types';

/**
 * Görüntüleme ANINDAKİ satılabilirlik (08.9 · `ANALYTICS §3`).
 *
 * **Neden kaydediliyor:** kaydedilmezse "çok bakılıp az alınan" listesinin başına stoksuz ürünler
 * oturur ve yönetici fiyata/görsele bakar — oysa doğru aksiyon tedariktir. Sonradan da kurulamaz,
 * çünkü stok hareket ediyor; bu bir anlık görüntü (emsal: `order_item.unit_price`).
 *
 * **Ürün düzeyinde EN İYİ HÂL yazılır**, en kötüsü değil: müşteri varyantlardan biri alınabiliyorsa
 * o ürünü alabilir. Bir boyu tükenmiş ürünü "tükendi" saymak, satılabilir bir ürünü ölçümde
 * kaybetmek olurdu.
 *
 * **Sıra anlamlı:** önce "satışa kapalı" (hiçbir varyantın fiyatı yok — bu bir stok hâli değil, bir
 * satış kararı), sonra satılabilirlik, sonra yer, en sonda tükenme.
 *
 * ── BİLİNEN SINIR: `shipping` hâli `sellable`a katlanıyor ────────────────────
 * Vitrinin dördü (`available · shipping · elsewhere · out_of_stock`) ile defterin dördü
 * (`sellable · sold_out · closed · not_here`) aynı dörtlü DEĞİL. Yalnız kargo deposunda olan ürün
 * satın alınabilir ama sürtünmelidir (ayrı sipariş, ayrı ödeme, kargo ücreti) ve dönüşümü doğal
 * olarak düşüktür. İkisini `sellable`a toplamak o farkı görünmez kılıyor; ayrımın deftere girip
 * girmeyeceği kullanıcının elinde (04.08) — girerse burası tek satır değişir.
 */
export function availabilityOf(variants: readonly StorefrontVariant[]): AnalyticsAvailability {
  if (variants.every((v) => v.priceCents === null)) return 'closed';
  const sellable = variants.filter((v) => v.priceCents !== null);
  if (sellable.some((v) => v.stockStatus === 'available' || v.stockStatus === 'shipping')) return 'sellable';
  if (sellable.some((v) => v.stockStatus === 'elsewhere')) return 'not_here';
  return 'sold_out';
}
