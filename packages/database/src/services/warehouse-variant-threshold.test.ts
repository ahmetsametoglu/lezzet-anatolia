import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { CategoryService } from './category.service';
import { ProductService } from './product.service';
import { WarehouseVariantThresholdService } from './warehouse-variant-threshold.service';
import { createTestWarehouse, purgeTestData } from '../testing';

/** Depo eşiği istisnası yalnız kendi deposunda geçer, yeniden yazılınca güncellenir ve kaldırılınca depo varyantın varsayılanına döner. */
const db = serviceDb();
const thresholds = new WarehouseVariantThresholdService(db);
const stamp = Date.now();
let categoryId = '';
let productId = '';
let variantId = '';
let depotA = '';
let depotB = '';

beforeAll(async () => {
  categoryId = (await new CategoryService(db).create({ name: { tr: `Depo eşiği ${stamp}` } })).id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Depo eşiği böreği ${stamp}` },
    categoryId,
    variants: [{ label: { tr: '1 kg' } }],
  });
  productId = product.id;
  variantId = variants[0]!.id;
  depotA = (await createTestWarehouse(db, { label: 'ESKA' })).id;
  depotB = (await createTestWarehouse(db, { label: 'ESKB' })).id;
});

afterAll(async () => {
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], warehouseIds: [depotA, depotB] });
});

describe('depo eşiği istisnası', () => {
  it('istisna yalnız kendi deposunda geçer, yeniden yazılınca güncellenir, kaldırılınca varsayılan döner', async () => {
    const defaults = new Map([[variantId, 5]]);

    await thresholds.set({ warehouseId: depotA, variantId, minStockQty: 40 });
    await thresholds.set({ warehouseId: depotA, variantId, minStockQty: 30 });
    expect((await thresholds.resolve(depotA, defaults)).get(variantId)).toEqual({ defaultQty: 5, overrideQty: 30, minStockQty: 30 });
    expect((await thresholds.resolve(depotB, defaults)).get(variantId)).toEqual({ defaultQty: 5, overrideQty: null, minStockQty: 5 });

    await thresholds.clear(depotA, variantId);
    expect((await thresholds.resolve(depotA, defaults)).get(variantId)).toEqual({ defaultQty: 5, overrideQty: null, minStockQty: 5 });
  });

  it('varsayılanı olmayan boyda istisna eşiğin kendisidir', async () => {
    await thresholds.set({ warehouseId: depotB, variantId, minStockQty: 12 });
    try {
      expect((await thresholds.resolve(depotB, new Map([[variantId, null]]))).get(variantId)).toEqual({
        defaultQty: null,
        overrideQty: 12,
        minStockQty: 12,
      });
    } finally {
      await thresholds.clear(depotB, variantId);
    }
  });
});
