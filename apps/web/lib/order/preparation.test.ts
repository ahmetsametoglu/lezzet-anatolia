import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CategoryService, OrderService, ProductService, StockService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';

/**
 * Hazırlık onayı (06.5'in yazım yarısı) — depocunun onayladığı partiler kalem–parti eşlemesine
 * yazılır ve `fulfilled_qty` Σ parti olur. Fiili stok BURADA düşmez (teslimde, 07.7).
 */
const db = serviceDb();
const orders = new OrderService(db);
const stocks = new StockService(db);

const damga = Date.now();
let customerId: string;
let variantId: string;
let productId: string;
let categoryId: string;
let partiA: string;
let partiB: string;
const acilanProfiller: string[] = [];

const gun = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  const category = await new CategoryService(db).create({ name: { tr: `Hazırlık testi ${damga}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Sarma ${damga}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;

  const profile = await new UserProfileService(db).insert({ name: `Hazırlık müşterisi ${damga}` });
  customerId = profile.id;
  acilanProfiller.push(profile.id);
});

beforeEach(async () => {
  await db.from('order').delete().eq('customer_id', customerId);
  await db.from('stock').delete().eq('variant_id', variantId);
  partiA = (await stocks.insert({ variantId, physicalQty: 3, expiryDate: gun(20), purchasePrice: 2 })).id;
  partiB = (await stocks.insert({ variantId, physicalQty: 10, expiryDate: gun(200), purchasePrice: 3 })).id;
});

afterAll(async () => {
  await db.from('order').delete().eq('customer_id', customerId);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: acilanProfiller });
});

async function siparisAc(qty = 5) {
  return orders.create({ customerId, channel: 'b2c' }, [{ variantId, qty, unitPrice: 10, vatRate: 5.5 }]);
}

describe('hazırlık onayı (06.5)', () => {
  it('kalem birden çok partiden karşılanabilir; Σ parti = karşılanan miktar', async () => {
    const { order, items } = await siparisAc(5);

    await orders.recordPreparation(order.id, [
      { orderItemId: items[0]!.id, batches: [{ stockId: partiA, qty: 3 }, { stockId: partiB, qty: 2 }] },
    ]);

    const partiler = await orders.listBatches(order.id);
    expect(partiler.reduce((s, b) => s + b.qty, 0)).toBe(5);
    const guncelKalem = (await orders.getWithItems(order.id))!.items[0]!;
    expect(guncelKalem.fulfilledQty).toBe(5);
  });

  it('fiili stok BURADA düşmez — mal hâlâ ayrılmış durumda', async () => {
    const { order, items } = await siparisAc(3);
    await orders.recordPreparation(order.id, [{ orderItemId: items[0]!.id, batches: [{ stockId: partiA, qty: 3 }] }]);

    expect((await stocks.getById(partiA))?.physicalQty).toBe(3); // değişmedi
  });

  it('eksik hazırlanabilir (kısmi karşılama) — fazlası hazırlanamaz', async () => {
    const { order, items } = await siparisAc(5);

    await orders.recordPreparation(order.id, [{ orderItemId: items[0]!.id, batches: [{ stockId: partiB, qty: 2 }] }]);
    expect((await orders.getWithItems(order.id))!.items[0]!.fulfilledQty).toBe(2);

    await expect(
      orders.recordPreparation(order.id, [{ orderItemId: items[0]!.id, batches: [{ stockId: partiB, qty: 9 }] }]),
    ).rejects.toThrow();
  });

  it('hiç hazırlanamayan kalem: boş parti listesi → karşılanan 0', async () => {
    const { order, items } = await siparisAc(4);
    await orders.recordPreparation(order.id, [{ orderItemId: items[0]!.id, batches: [] }]);

    expect((await orders.getWithItems(order.id))!.items[0]!.fulfilledQty).toBe(0);
    expect(await orders.listBatches(order.id)).toHaveLength(0);
  });

  it('yeniden hazırlık önceki kaydı YENİSİYLE DEĞİŞTİRİR, yamalamaz', async () => {
    const { order, items } = await siparisAc(5);
    await orders.recordPreparation(order.id, [{ orderItemId: items[0]!.id, batches: [{ stockId: partiA, qty: 3 }] }]);
    await orders.recordPreparation(order.id, [{ orderItemId: items[0]!.id, batches: [{ stockId: partiB, qty: 4 }] }]);

    const partiler = await orders.listBatches(order.id);
    expect(partiler).toHaveLength(1);
    expect(partiler[0]).toMatchObject({ stockId: partiB, qty: 4 });
    expect((await orders.getWithItems(order.id))!.items[0]!.fulfilledQty).toBe(4);
  });

  it('başka siparişin kalemi bu siparişe yazılamaz', async () => {
    const { order } = await siparisAc(2);
    const { items: baskaKalemler } = await siparisAc(2);

    await expect(
      orders.recordPreparation(order.id, [{ orderItemId: baskaKalemler[0]!.id, batches: [{ stockId: partiB, qty: 1 }] }]),
    ).rejects.toThrow();
  });

  it('kalemsiz onay reddedilir', async () => {
    const { order } = await siparisAc(1);
    await expect(orders.recordPreparation(order.id, [])).rejects.toThrow();
  });
});
