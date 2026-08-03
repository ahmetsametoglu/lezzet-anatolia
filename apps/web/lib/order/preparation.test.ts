import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CategoryService, OrderItemBatchService, OrderService, ProductService, StockService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData, createTestWarehouse } from '@lezzet/database/testing';

/**
 * Hazırlık onayı (06.5'in yazım yarısı) — depocunun onayladığı partiler kalem–parti eşlemesine
 * yazılır ve `fulfilled_qty` Σ parti olur. Fiili stok BURADA düşmez (teslimde, 07.7).
 */
const db = serviceDb();
const orders = new OrderService(db);
const itemBatches = new OrderItemBatchService(db);
const stocks = new StockService(db);

const stamp = Date.now();
let customerId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
let variantId: string;
let productId: string;
let categoryId: string;
let batchA: string;
let batchB: string;
const createdProfiles: string[] = [];

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `Hazırlık testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Sarma ${stamp}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;

  const profile = await new UserProfileService(db).insert({ name: `Hazırlık müşterisi ${stamp}` });
  customerId = profile.id;
  createdProfiles.push(profile.id);
});

beforeEach(async () => {
  await db.from('order').delete().eq('customer_id', customerId);
  await db.from('stock').delete().eq('variant_id', variantId);
  batchA = (await stocks.insert({ warehouseId, variantId, physicalQty: 3, expiryDate: dayOffset(20), purchasePriceCents: 200 })).id;
  batchB = (await stocks.insert({ warehouseId, variantId, physicalQty: 10, expiryDate: dayOffset(200), purchasePriceCents: 300 })).id;
});

afterAll(async () => {
  await db.from('order').delete().eq('customer_id', customerId);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: createdProfiles });
  await db.from('warehouse').delete().eq('id', warehouseId);
});

async function createOrder(qty = 5) {
  return orders.create({ warehouseId, customerId, channel: 'b2c' }, [{ variantId, qty, unitPrice: 10, vatRate: 5.5 }]);
}

describe('hazırlık onayı (06.5)', () => {
  it('kalem birden çok partiden karşılanabilir; Σ parti = karşılanan miktar', async () => {
    const { order, items } = await createOrder(5);

    await orders.recordPreparation(order.id, [
      { orderItemId: items[0]!.id, batches: [{ stockId: batchA, qty: 3 }, { stockId: batchB, qty: 2 }] },
    ]);

    const partiler = await itemBatches.listByOrder(order.id);
    expect(partiler.reduce((s, b) => s + b.qty, 0)).toBe(5);
    const currentLine = (await orders.getWithItems(order.id))!.items[0]!;
    expect(currentLine.fulfilledQty).toBe(5);
  });

  it('fiili stok BURADA düşmez — mal hâlâ ayrılmış durumda', async () => {
    const { order, items } = await createOrder(3);
    await orders.recordPreparation(order.id, [{ orderItemId: items[0]!.id, batches: [{ stockId: batchA, qty: 3 }] }]);

    expect((await stocks.getById(batchA))?.physicalQty).toBe(3); // değişmedi
  });

  it('eksik hazırlanabilir (kısmi karşılama) — fazlası hazırlanamaz', async () => {
    const { order, items } = await createOrder(5);

    await orders.recordPreparation(order.id, [{ orderItemId: items[0]!.id, batches: [{ stockId: batchB, qty: 2 }] }]);
    expect((await orders.getWithItems(order.id))!.items[0]!.fulfilledQty).toBe(2);

    await expect(
      orders.recordPreparation(order.id, [{ orderItemId: items[0]!.id, batches: [{ stockId: batchB, qty: 9 }] }]),
    ).rejects.toThrow();
  });

  it('hiç hazırlanamayan kalem: boş parti listesi → karşılanan 0', async () => {
    const { order, items } = await createOrder(4);
    await orders.recordPreparation(order.id, [{ orderItemId: items[0]!.id, batches: [] }]);

    expect((await orders.getWithItems(order.id))!.items[0]!.fulfilledQty).toBe(0);
    expect(await itemBatches.listByOrder(order.id)).toHaveLength(0);
  });

  it('yeniden hazırlık önceki kaydı YENİSİYLE DEĞİŞTİRİR, yamalamaz', async () => {
    const { order, items } = await createOrder(5);
    await orders.recordPreparation(order.id, [{ orderItemId: items[0]!.id, batches: [{ stockId: batchA, qty: 3 }] }]);
    await orders.recordPreparation(order.id, [{ orderItemId: items[0]!.id, batches: [{ stockId: batchB, qty: 4 }] }]);

    const partiler = await itemBatches.listByOrder(order.id);
    expect(partiler).toHaveLength(1);
    expect(partiler[0]).toMatchObject({ stockId: batchB, qty: 4 });
    expect((await orders.getWithItems(order.id))!.items[0]!.fulfilledQty).toBe(4);
  });

  it('başka siparişin kalemi bu siparişe yazılamaz', async () => {
    const { order } = await createOrder(2);
    const { items: baskaKalemler } = await createOrder(2);

    await expect(
      orders.recordPreparation(order.id, [{ orderItemId: baskaKalemler[0]!.id, batches: [{ stockId: batchB, qty: 1 }] }]),
    ).rejects.toThrow();
  });

  it('kalemsiz onay reddedilir', async () => {
    const { order } = await createOrder(1);
    await expect(orders.recordPreparation(order.id, [])).rejects.toThrow();
  });
});
