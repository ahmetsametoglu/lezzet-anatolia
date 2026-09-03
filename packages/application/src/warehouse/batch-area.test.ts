import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, ProductService, StockService, StorageAreaService, serviceDb } from '@lezzet/database';
import { purgeTestData, createTestWarehousePair } from '@lezzet/database/testing';
import { listWarehouseAreas, markBatchSeen } from './batch-area';

/**
 * **Parti "son görüldüğü yer"** (kullanıcı kararı 03.09) — taşıma kaydı YOK, adres seçim anında
 * öğrenilir. Sınanan şey kapının üç sınırı: alan ve parti AYNI deponun olmalı (ikisi ayrı ayrı
 * reddedilir), kapalı alan seçilemez, aynı alana ikinci yazım "değişmedi" der ama hata değildir.
 */
const db = serviceDb();
const stocks = new StockService(db);
const areas = new StorageAreaService(db);

const stamp = Date.now();
let warehouseId: string;
let otherWarehouseId: string;
let productId: string;
let categoryId: string;
let variantId: string;
let freezer1: string;
let freezer2: string;
let closedArea: string;
let foreignArea: string;
let batchId: string;
let foreignBatchId: string;

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  const { primary, secondary } = await createTestWarehousePair(db);
  warehouseId = primary.id;
  otherWarehouseId = secondary.id;

  const category = await new CategoryService(db).create({ name: { tr: `Alan kapısı ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Kek ${stamp}` },
    categoryId: category.id,
    variants: [{ label: { tr: '90 g' } }],
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;

  freezer1 = (await areas.insert({ warehouseId, name: `Dondurucu 1 ${stamp}`, kind: 'frozen', sortOrder: 0 })).id;
  freezer2 = (await areas.insert({ warehouseId, name: `Dondurucu 2 ${stamp}`, kind: 'frozen', sortOrder: 1 })).id;
  closedArea = (await areas.insert({ warehouseId, name: `Eski dolap ${stamp}`, kind: 'frozen', isActive: false })).id;
  foreignArea = (await areas.insert({ warehouseId: otherWarehouseId, name: `Kehl dolabı ${stamp}`, kind: 'frozen' })).id;

  batchId = (
    await stocks.insert({ warehouseId, variantId, physicalQty: 14, expiryDate: dayOffset(20), purchasePriceCents: 300, storageAreaId: freezer1 })
  ).id;
  foreignBatchId = (
    await stocks.insert({ warehouseId: otherWarehouseId, variantId, physicalQty: 5, expiryDate: dayOffset(20), purchasePriceCents: 300 })
  ).id;
});

afterAll(async () => {
  // Alanlar depoyla gider (`purgeTestData` depoyu silmeden önce `storage_area`yı süpürür); parti
  // ürünle. Elle silme YOK (CLAUDE §4b).
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    warehouseIds: [warehouseId, otherWarehouseId],
  });
});

describe('listWarehouseAreas', () => {
  it('yalnız BU deponun AÇIK alanlarını, operatörün sırasıyla döner', async () => {
    const rows = await listWarehouseAreas(db, warehouseId);
    const ids = rows.map((row) => row.id);

    expect(ids).toEqual([freezer1, freezer2]);
    expect(ids).not.toContain(closedArea);
    expect(ids).not.toContain(foreignArea);
  });
});

describe('markBatchSeen', () => {
  it('başka dolapta görülen parti oraya YAZILIR; aynı dolapta ikinci görülme yazım değildir', async () => {
    const moved = await markBatchSeen(db, { warehouseId, stockId: batchId, storageAreaId: freezer2 });
    expect(moved).toEqual({ status: 'ok', changed: true, storageAreaName: `Dondurucu 2 ${stamp}` });
    expect((await stocks.getById(batchId))?.storageAreaId).toBe(freezer2);

    const again = await markBatchSeen(db, { warehouseId, stockId: batchId, storageAreaId: freezer2 });
    expect(again).toEqual({ status: 'ok', changed: false, storageAreaName: `Dondurucu 2 ${stamp}` });
  });

  it('KAPALI alan ve BAŞKA deponun alanı `invalid_area` — parti yerinde kalır', async () => {
    expect(await markBatchSeen(db, { warehouseId, stockId: batchId, storageAreaId: closedArea })).toEqual({ status: 'invalid_area' });
    expect(await markBatchSeen(db, { warehouseId, stockId: batchId, storageAreaId: foreignArea })).toEqual({ status: 'invalid_area' });
    expect((await stocks.getById(batchId))?.storageAreaId).toBe(freezer2);
  });

  it('BAŞKA deponun partisi `out_of_scope`, olmayan parti `not_found`', async () => {
    expect(await markBatchSeen(db, { warehouseId, stockId: foreignBatchId, storageAreaId: freezer1 })).toEqual({
      status: 'forbidden',
      reason: 'out_of_scope',
    });
    expect(await markBatchSeen(db, { warehouseId, stockId: '00000000-0000-4000-8000-000000000000', storageAreaId: freezer1 })).toEqual({
      status: 'not_found',
    });
    expect((await stocks.getById(foreignBatchId))?.storageAreaId).toBeNull();
  });
});
