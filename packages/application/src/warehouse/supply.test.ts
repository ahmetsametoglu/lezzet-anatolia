import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CategoryService,
  ProductService,
  PurchaseOrderItemService,
  SupplierProductService,
  SupplierService,
  WarehouseService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { openPurchaseDraft, openSuggestionDrafts } from './supply';

/**
 * Taslak tedarik siparişi tek işe yazılır: öneri iki işin tesisinde eksikse her iş kendi taslağını alır, elle açılan taslağın işi hedef
 * depodan gelir (docs/feature/iki-is.md, karar 4).
 */
const db = serviceDb();
const stamp = Date.now();
let lezzetDepo: string;
let qualiteDepo: string;
let supplierId: string;
let categoryId: string;
let productId: string;
let variantId: string;

beforeAll(async () => {
  lezzetDepo = (await createTestWarehouse(db, { label: 'OSL' })).id;
  qualiteDepo = (await createTestWarehouse(db, { label: 'OSQ' })).id;
  await new WarehouseService(db).update({ id: qualiteDepo, business: 'qualite' });
  categoryId = (await new CategoryService(db).create({ name: { tr: `Öneri taslağı ${stamp}` } })).id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Sucuk ${stamp}` },
    categoryId,
    variants: [{ label: { tr: '1 kg' }, minStockQty: 10 }],
  });
  productId = product.id;
  variantId = variants[0]!.id;
  // Tedarikçinin varsayılanı Lezzet: hedef deponun işi bu varsayılanı ezmeli.
  supplierId = (await new SupplierService(db).insert({ name: `Öneri tedarikçisi ${stamp}`, defaultBusiness: 'lezzet' })).id;
  await new SupplierProductService(db).setMapping({ supplierId, variantId, supplierCode: `OS-${stamp}`, nameAtSupplier: 'Sucuk 1 kg' });
});

afterAll(async () => {
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    supplierIds: [supplierId],
    warehouseIds: [lezzetDepo, qualiteDepo],
  });
});

describe('taslak tedarik siparişinin işi', () => {
  it('iki işin tesisinde eksik olan kalem iki taslağa bölünür, her taslak kendi işinin deposunu hedefler', async () => {
    const orders = await openSuggestionDrafts(db, { supplierId, facilityIds: [lezzetDepo, qualiteDepo] });
    expect(orders.map((order) => order.business).sort()).toEqual(['lezzet', 'qualite']);

    const items = new PurchaseOrderItemService(db);
    for (const order of orders) {
      const targets = (await items.listByOrder(order.id)).map((item) => item.targetWarehouseId);
      expect(targets).toEqual([order.business === 'qualite' ? qualiteDepo : lezzetDepo]);
    }
  });

  it('elle taslağın işi hedef depodan gelir; iki işin deposuna giden kalemler tek taslakta durmaz', async () => {
    const draft = await openPurchaseDraft(db, { supplierId, lines: [{ variantId, qty: 2, targetWarehouseId: qualiteDepo }] });
    expect(draft).toMatchObject({ status: 'ok', order: { business: 'qualite' } });

    const mixed = await openPurchaseDraft(db, {
      supplierId,
      lines: [
        { variantId, qty: 1, targetWarehouseId: qualiteDepo },
        { variantId, qty: 1, targetWarehouseId: lezzetDepo },
      ],
    });
    expect(mixed.status).toBe('mixed_business');
  });
});
