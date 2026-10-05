import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { createTestWarehouse } from '../testing/warehouse';
import { purgeTestData } from '../testing/cleanup';
import { CategoryService } from './category.service';
import { ProductService } from './product.service';
import { PurchaseOrderService } from './purchase-order.service';
import { StockIntakeService } from './stock-intake.service';
import { SupplierService } from './supplier.service';
import { WarehouseService } from './warehouse.service';

/**
 * Tedarik siparişi tek işe yazılır: kalemin hedef deposu ve siparişe bağlı mal kabulün deposu siparişin işindendir ve iş sonradan değişmez
 * (docs/feature/iki-is.md, karar 4).
 */
const db = serviceDb();
const orders = new PurchaseOrderService(db);
const intakes = new StockIntakeService(db);
const stamp = Date.now();
const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
let lezzetDepo: string;
let qualiteDepo: string;
let supplierId: string;
let categoryId: string;
let productId: string;
let variantId: string;

beforeAll(async () => {
  lezzetDepo = (await createTestWarehouse(db, { label: 'TSL' })).id;
  qualiteDepo = (await createTestWarehouse(db, { label: 'TSQ' })).id;
  await new WarehouseService(db).update({ id: qualiteDepo, business: 'qualite' });
  categoryId = (await new CategoryService(db).create({ name: { tr: `Tedarikte iş ${stamp}` } })).id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Kaşar ${stamp}` },
    categoryId,
    variants: [{ label: { tr: '1 kg' } }],
  });
  productId = product.id;
  variantId = variants[0]!.id;
  supplierId = (await new SupplierService(db).insert({ name: `İki iş tedarikçisi ${stamp}` })).id;
});

afterAll(async () => {
  // Tedarikçinin siparişleri ve kabulleri tedarikçiyle birlikte gider (`purgeTestData`).
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    supplierIds: [supplierId],
    warehouseIds: [lezzetDepo, qualiteDepo],
  });
});

describe('tedarik siparişinin işi', () => {
  it('kalemin hedef deposu siparişin işinden olmak zorunda', async () => {
    await expect(orders.createDraft(supplierId, 'qualite', [{ variantId, qty: 1, targetWarehouseId: lezzetDepo }])).rejects.toThrow(
      /tedarik siparişinin işinden değil/,
    );
    const { items } = await orders.createDraft(supplierId, 'qualite', [{ variantId, qty: 1, targetWarehouseId: qualiteDepo }]);
    expect(items[0]?.targetWarehouseId).toBe(qualiteDepo);
  });

  it('siparişe bağlı mal kabul siparişin işinin deposuna yapılır', async () => {
    const { order } = await orders.createDraft(supplierId, 'qualite', [{ variantId, qty: 4 }]);
    const lines = [{ variantId, qty: 4, expiryDate: dayOffset(200) }];
    await expect(intakes.receive({ warehouseId: lezzetDepo, supplierId, purchaseOrderId: order.id, lines })).rejects.toThrow(
      /tedarik siparişinin işinden değil/,
    );
    const outcome = await intakes.receive({ warehouseId: qualiteDepo, supplierId, purchaseOrderId: order.id, lines });
    expect(outcome.stockIds).toHaveLength(1);
  });

  it('açık siparişin bekleyen kalemleri siparişin işini taşır', async () => {
    const { order } = await orders.createDraft(supplierId, 'qualite', [{ variantId, qty: 2, targetWarehouseId: qualiteDepo }]);
    const rows = (await orders.openProgress()).filter((row) => row.purchaseOrderId === order.id);
    expect(rows.map((row) => row.business)).toEqual(['qualite']);
  });

  it('siparişin işi sonradan değişmez', async () => {
    const { order } = await orders.createDraft(supplierId, 'lezzet', [{ variantId, qty: 1 }]);
    const { error } = await db.from('purchase_order').update({ business: 'qualite' }).eq('id', order.id);
    expect(error?.message).toMatch(/işi değişmez/);
  });
});
