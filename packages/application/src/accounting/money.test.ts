import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, OrderService, ProductService, UserProfileService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { readMoneyOverview } from './money';

/** Para ekranının bekleyen tahsilatı: kalan ödeme durumunun türetiminden okunur, sipariş toplamından değil. */
const db = serviceDb();
const stamp = Date.now();
/** Bekleyen liste teslim gününe göre okunur; testin kendi günü başka testin siparişini karıştırmaz. */
const deliveryDate = `2099-${String((stamp % 12) + 1).padStart(2, '0')}-${String((stamp % 28) + 1).padStart(2, '0')}`;
let warehouseId: string;
let customerId: string;
let categoryId: string;
let productId: string;
let variantId: string;

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'PARA' })).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Para ekranı ${stamp}` } })).id;
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Sucuk ${stamp}` }, categoryId });
  productId = product.id;
  variantId = variants[0]!.id;
  customerId = (await new UserProfileService(db).insert({ name: `Para müşterisi ${stamp}` })).id;
});

afterAll(async () => {
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: [customerId], warehouseIds: [warehouseId] });
});

describe('para ekranı', () => {
  it('yola çıkmış siparişte eksik karşılanan kalem kalandan düşer — kapıda fazla para istenmez', async () => {
    const { order } = await new OrderService(db).create(
      { warehouseId, customerId, channel: 'b2c', status: 'out_for_delivery', deliveryDate, orderedTotalCents: 2000 },
      [{ variantId, qty: 2, fulfilledQty: 1, unitPriceCents: 1000, vatRate: 5.5 }],
    );

    const { pending } = await readMoneyOverview(db, { date: deliveryDate });

    expect(pending.find((row) => row.orderId === order.id)?.remainingCents).toBe(1000);
  });
});
