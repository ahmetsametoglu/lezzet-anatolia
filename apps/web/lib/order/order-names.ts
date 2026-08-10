import type { CustomerOrderSummary } from '@lezzet/application';

/**
 * Sipariş satırının alt yazısında adı geçen ürünler — tasarım üç ad istiyor
 * ("22 Temmuz · 3 kalem · Baklava, Gözleme, Bayram Sofrası").
 *
 * **Sınır burada, tek yerde.** Aynı satırı iki ekran yazıyor: sipariş listesi ve talep formundaki
 * sipariş seçici. Sayı ikisine ayrı ayrı yazılsaydı bir gün biri değişir, öteki kalırdı.
 *
 * Kapı (`listCustomerOrders`) beşe kadar taşıyor çünkü mobil kart o kadar küçük resim çiziyor;
 * kaçının YAZIYA döküleceği yüzeyin kararıdır ve bu dosya o kararı tutuyor.
 *
 * Okuma kapısının kendisinden AYRI duruyor, çünkü o kapı `server-only`: bu satırı yazan iki ekran
 * da istemci komponenti ve aynı dosyadan okusalardı sunucu kapısı istemci paketine sızardı.
 */
const SUMMARY_NAME_LIMIT = 3;

export function orderProductNames(order: CustomerOrderSummary): string[] {
  return order.thumbs.slice(0, SUMMARY_NAME_LIMIT).map((thumb) => thumb.name);
}
