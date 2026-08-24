import type { AnalyticsAvailability, CartLineRoute } from '@lezzet/types';
import type { StorefrontVariant } from '../catalog/storefront-types';

/**
 * Görüntüleme ANINDAKİ satılabilirlik (08.9 · `ANALYTICS §3`).
 *
 * **`apps/web`ten BURAYA TAŞINDI (24.08 · MB-63)** — native ölçüm açılınca ikinci tüketici doğdu
 * ve bu saf mantık iki yüzeyde AYNI soruyu soruyor. Kopyalansaydı aynı ürün bir gün web'de
 * `sellable`, native'de `sold_out` sınıflanabilir ve hiçbir yerde hata vermezdi.
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

/**
 * PAKETİN görüntüleme anındaki satılabilirliği (24.08 · MB-63).
 *
 * **Neden `availabilityOf`un ikizi değil, komşusu:** ürün satılabilirliği VARYANTLARDAN türer
 * ("bir boyu alınabiliyorsa ürün alınabilir"); paketin varyantı yoktur, kendi alanları vardır ve
 * **paket BÖLÜNMEZ** (`StorefrontPackage.route` künyesi) — yani "en iyi hâl" kuralının paket
 * karşılığı yok. İki ayrı veriden iki ayrı türetme; ama AYNI dosyada, çünkü ikisi de defterin aynı
 * dört kovasına yazıyor ve biri değişirse ötekinin de gözden geçirilmesi gerekir.
 *
 * **Sıra `availabilityOf`unkiyle aynı ve aynı gerekçeyle:** önce "satışa kapalı" (fiyatı yok — bu
 * bir stok hâli değil, bir satış kararı), sonra yer, sonra tükenme.
 *
 * `route === null` (yer bilinmiyor) `not_here` DEĞİLDİR: bilmediğimiz bir şeyi "buraya gelmiyor"
 * diye yazmak, ölçülemeyeni olumsuz saymak olurdu (CLAUDE §1). O hâlde yalnız `soldOut` konuşur.
 */
export function bundleAvailabilityOf(pack: {
  priceCents: number | null;
  soldOut: boolean;
  route: CartLineRoute | null;
}): AnalyticsAvailability {
  if (pack.priceCents === null) return 'closed';
  if (pack.route === 'not_shippable_here') return 'not_here';
  if (pack.soldOut || pack.route === 'unavailable') return 'sold_out';
  return 'sellable';
}
