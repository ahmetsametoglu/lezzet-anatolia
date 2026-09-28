import { CartService, type Db } from '@lezzet/database';
import { cartKey, entryOfItem, type CartRef } from './cart-types';

/**
 * Sonraya kaydedilen kalemleri sepete geri alır: aynı satır sepette varsa adet birleşir (servisin ekleme kuralı) ve kalem listeden
 * düşer. Web aynı taşımayı istemcide iki listeyi eşitleyerek yapar; native bu kapıdan geçer.
 */
export async function restoreSavedItems(db: Db, customerId: string, refs: readonly CartRef[]): Promise<void> {
  const carts = new CartService(db);
  const cart = await carts.get(customerId);
  const keys = new Set(refs.map(cartKey));
  const moving = cart.savedItems.filter((item) => keys.has(cartKey(entryOfItem(item))));
  if (moving.length === 0) return;
  await carts.addItems(customerId, moving);
  await carts.replaceSaved(
    customerId,
    cart.savedItems.filter((item) => !moving.includes(item)),
  );
}
