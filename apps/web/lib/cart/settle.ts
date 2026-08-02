import 'server-only';
import { CartService, OrderService, serviceDb } from '@lezzet/database';

/**
 * Sipariş kesinleşince sepetten **yalnız o siparişin kalemleri** düşer (19.7).
 *
 * ── NEDEN KISMİ ──────────────────────────────────────────────────────────────
 * Sepet iki grup taşıyabiliyor: kapıya gidenler + kargoyla gidenler. İkisi ayrı sipariş, ayrı
 * ödeme; ikincisi ZORUNLU DEĞİL. Sepeti toptan boşaltmak, tasarımın açık sözünü bozardı — müşteri
 * kapıya siparişini verir vermez kargo grubu da sessizce yok olurdu. Tasarımın cümlesi net:
 * *"verilmezse kalemler sepette bekler"* (`musteri-yer-ekseni §4`).
 *
 * ── NEDEN SİPARİŞTEN OKUNUYOR, İSTEMCİDEN DEĞİL ──────────────────────────────
 * Hangi kalemlerin sipariş edildiğini istemci de gönderebilirdi ama iki yol var: kapıda ödemede
 * temizlik onay çağrısında, kartta **webhook'ta** oluyor (ödeme geçtiği an — taslak açılırken
 * temizlense, ödemesi düşen müşteri sepetini de kaybederdi). Webhook'ta istemcinin gönderdiği bir
 * liste yok; siparişin kendisi var. Tek kaynak, iki yol.
 *
 * ── PARTİ (`stockId`) AYRIMI GÖZETİLMEZ ──────────────────────────────────────
 * Sepet aynı varyantı iki satırda taşıyabilir (biri teklif partisine çıpalı). Sipariş kalemi
 * partiyi taşımadığı için eşleştirme varyant düzeyinde yapılır — ve bu DOĞRU sonucu verir: iki
 * satırın da yolu aynıdır (yol varyantın stoğundan çıkar), yani ikisi de aynı siparişe girmiştir.
 */
export async function clearOrderedLines(customerId: string, orderId: string): Promise<void> {
  const db = serviceDb();
  const cart = new CartService(db);
  const order = await new OrderService(db).getWithItems(orderId);
  const { items } = await cart.get(customerId);
  if (!order || items.length === 0) return;

  /**
   * Paketin İÇİNDEKİ kalemler varyant kümesine GİRMEZ. Taslak paketi açıp içeriğini satır satır
   * yazıyor (`bundleId` dolu); o varyantları sipariş edilmiş saymak, aynı ürünü ayrı bir satırda
   * da taşıyan müşterinin o satırını sessizce silerdi — oysa tasarım ikisinin ayrı kalmasını
   * söylüyor ("aynı ürün hem pakette hem ayrı satırda olabilir — birleştirilmez").
   */
  const orderedVariants = new Set(order.items.filter((item) => !item.bundleId).map((item) => item.variantId));
  const orderedBundles = new Set(order.items.map((item) => item.bundleId).filter((id): id is string => Boolean(id)));

  const remaining = items.filter((row) => (row.bundleId ? !orderedBundles.has(row.bundleId) : !orderedVariants.has(row.variantId ?? '')));
  // Hiç kalmadıysa satır tamamen silinir: boş bir sepet satırı bırakmak, "sepetim var ama boş"
  // diye okunan bir kayıt üretirdi (`CartService.clear` künyesi).
  if (remaining.length === 0) {
    await cart.clear(customerId);
    return;
  }
  await cart.replace(customerId, remaining);
}
