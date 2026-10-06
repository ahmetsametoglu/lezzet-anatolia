import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, ProductService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { countDiscoverDeck, openDiscoverDeck } from './discover';

/** Keşif turu puan için oynanır; profesyonel müşteriye deste açılmaz ve vitrin davet etmez (docs/feature/iki-is.md, karar 13). */
const db = serviceDb();
const stamp = Date.now();
let categoryId: string;
let productId: string;

beforeAll(async () => {
  categoryId = (await new CategoryService(db).create({ name: { tr: `Keşfin işi ${stamp}` } })).id;
  const products = new ProductService(db);
  productId = (await products.create({ name: { tr: `Keşif böreği ${stamp}` }, categoryId, variants: [{ label: { tr: '1 adet' } }] }))
    .product.id;
  // Deste ilk 20 adaydır ve sıra `sortOrder`dır: kartın destede olduğu ancak öne alınınca ölçülebilir.
  await products.update({ id: productId, status: 'candidate', sortOrder: -2_000_000_000 });
});

afterAll(async () => {
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId] });
});

describe('keşif turunun müşterisi', () => {
  it('bireysel müşteriye aday kart çıkar, profesyonele deste açılmaz', async () => {
    const individualDeck = await openDiscoverDeck(db, 'fr', null, false);
    expect(individualDeck.map((card) => card.productId)).toContain(productId);

    expect(await openDiscoverDeck(db, 'fr', null, true)).toEqual([]);
    expect(await countDiscoverDeck(db, null, true)).toBe(0);
  });
});
