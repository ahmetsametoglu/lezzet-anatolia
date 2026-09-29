import { BundleItemService, CartService, OrderService, type Db } from '@lezzet/database';
import { bundleQtyOf } from '@lezzet/domain-core';
import type { OrderItem } from '@lezzet/types';
import { itemOfEntry, type CartEntry } from './cart-types';

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

/**
 * Ödemesi gelmeyen siparişin kalemleri sepete geri döner, çünkü müşteri o siparişi vermedi ve niyeti kaybolmamalı. Satır sepette
 * yeniden varsa adet toplanır (`addItems`); paketin adedi içeriğinden türer.
 */
export async function restoreOrderedLines(db: Db, customerId: string, orderId: string): Promise<void> {
  const found = await new OrderService(db).getWithItems(orderId);
  if (!found || found.items.length === 0) return;
  const variantRows = found.items
    .filter((item) => !item.bundleId)
    .map((item) => itemOfEntry(variantEntryOf(item), item.unitPriceCents / 100));
  const bundleRows = await bundleRowsOf(db, found.items);
  await new CartService(db).addItems(customerId, [...variantRows, ...bundleRows]);
}

/** Parti çıpası korunur: sepetten alınan satır teklif partisine bağlıydıysa aynı satır geri gelir. */
function variantEntryOf(item: OrderItem): CartEntry {
  return { kind: 'variant', variantId: item.variantId, qty: item.qty, stockId: item.stockId };
}

async function bundleRowsOf(db: Db, items: readonly OrderItem[]): Promise<ReturnType<typeof itemOfEntry>[]> {
  const bundleIds = [...new Set(items.map((item) => item.bundleId).filter((id): id is string => id !== null))];
  const contents = new BundleItemService(db);
  return Promise.all(
    bundleIds.map(async (bundleId) => {
      const own = items.filter((item) => item.bundleId === bundleId);
      const qty = bundleQtyOf(await contents.listByBundle(bundleId), own);
      const totalCents = own.reduce((sum, item) => sum + item.unitPriceCents * item.qty, 0);
      return itemOfEntry({ kind: 'bundle', bundleId, qty }, totalCents / qty / 100);
    }),
  );
}
