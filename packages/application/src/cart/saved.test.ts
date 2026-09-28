import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CartService, CategoryService, ProductService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { restoreSavedItems } from './saved';

/** Sonraya kaydedilenin sepete geri alınması: kalem kaybolmamalı, iki listede birden kalmamalı, aynı satırla birleşmeli. */
const db = serviceDb();
const carts = new CartService(db);
const stamp = Date.now();
let customerId: string;
let variantA: string;
let variantB: string;
let productId: string;
let categoryId: string;

beforeAll(async () => {
  const category = await new CategoryService(db).create({ name: { tr: `Kaydedilen testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Kaydedilen ürün ${stamp}` },
    categoryId: category.id,
    variants: [{ label: { tr: '500gr' } }, { label: { tr: '1kg' } }],
  });
  categoryId = category.id;
  productId = product.id;
  variantA = variants[0]!.id;
  variantB = variants[1]!.id;
  customerId = (await new UserProfileService(db).insert({ name: `Kaydedilen müşterisi ${stamp}` })).id;
});

afterAll(async () => {
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: [customerId] });
});

describe('restoreSavedItems', () => {
  it('istenen kalem sepete geçer ve listeden düşer; sepetteki aynı satırla adet birleşir, öteki kalem listede kalır', async () => {
    await carts.addItems(customerId, [{ variantId: variantA, qty: 1, unitPrice: 0, stockId: null }]);
    await carts.replaceSaved(customerId, [
      { variantId: variantA, qty: 2, unitPrice: 0, stockId: null },
      { variantId: variantB, qty: 1, unitPrice: 0, stockId: null },
    ]);

    await restoreSavedItems(db, customerId, [{ kind: 'variant', variantId: variantA, stockId: null }]);

    const cart = await carts.get(customerId);
    expect(cart.items.map((item) => [item.variantId, item.qty])).toEqual([[variantA, 3]]);
    expect(cart.savedItems.map((item) => item.variantId)).toEqual([variantB]);
  });
});
