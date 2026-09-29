import { CartService, OrderService, type Db } from '@lezzet/database';

/**
 * Sepetten yalnız siparişe giren kalemler düşer, çünkü kapı ve kargo grupları ayrı siparişlerdir ve verilmeyen grup sepette bekler.
 * Eşleştirme sipariş kalemlerinden varyant düzeyinde yapılır; kalem partiyi (`stockId`) taşımaz, aynı varyantın iki satırı da aynı
 * siparişe girmiştir.
 */
export async function clearOrderedLines(db: Db, customerId: string, orderId: string): Promise<void> {
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
