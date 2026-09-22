import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CategoryService, OrderService, ProductService, ReservationService, StockService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse, purgeVariantStock, mustDelete } from '@lezzet/database/testing';
import { deliverOrder } from './fulfillment';
import { transitionOrder } from './transition';

/**
 * Teslim, mal maliyeti ve kapanış uçtan uca: stok tam bir kez düşer, maliyet parti fiyatından kesinleşir,
 * parası alınmış sipariş teslimle kendiliğinden kapanır.
 */
const db = serviceDb();
const orders = new OrderService(db);
const stocks = new StockService(db);
const reservations = new ReservationService(db);

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
  const category = await new CategoryService(db).create({ name: { tr: `Teslim testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Yaprak sarma ${stamp}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  const profile = await new UserProfileService(db).insert({ name: `Teslim müşterisi ${stamp}` });
  customerId = profile.id;
  createdProfiles.push(profile.id);
});

beforeEach(async () => {
  // Sıra defter → parti → sipariş: defter satırı partiyi, parti siparişi tutar.
  await purgeVariantStock(db, [variantId]);
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  await mustDelete(db, 'reservation', (q) => q.eq('variant_id', variantId));
  batchA = (await stocks.insert({ warehouseId, variantId, physicalQty: 4, expiryDate: dayOffset(20), purchasePriceCents: 200 })).id;
  batchB = (await stocks.insert({ warehouseId, variantId, physicalQty: 10, expiryDate: dayOffset(200), purchasePriceCents: 300 })).id;
});

afterAll(async () => {
  // Parti ÖNCE: son testin siparişi deftere `sale` yazmış olabilir ve o satır siparişi tutuyor.
  await purgeVariantStock(db, [variantId]);
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    warehouseIds: [warehouseId],
  });
});

/** Sipariş aç → ayır → hazırla → yola çıkar. Teslime hazır hâle getirir. */
async function sendOut(picks: { stockId: string; qty: number }[]) {
  const total = picks.reduce((s, p) => s + p.qty, 0);
  const { order, items } = await orders.create(
    { warehouseId, customerId, channel: 'b2c', deliveryType: 'route' },
    [{ variantId, qty: total, unitPriceCents: 1000, vatRate: 5.5 }],
  );
  await reservations.reserve({ orderId: order.id, warehouseId, variantId, qty: total });
  for (const status of ['confirmed', 'preparing'] as const) await transitionOrder({ orderId: order.id, to: status });
  await orders.recordPreparation(order.id, [{ orderItemId: items[0]!.id, batches: picks }]);
  for (const status of ['ready', 'out_for_delivery'] as const) await transitionOrder({ orderId: order.id, to: status });
  return order;
}

describe('teslim (07.7)', () => {
  it('fiili stok kayıtlı partilerden düşer, rezervasyon biter', async () => {
    const order = await sendOut([{ stockId: batchA, qty: 4 }, { stockId: batchB, qty: 2 }]);

    const outcome = await deliverOrder(order.id, { deliveryProof: { by: 'Kurye', at: '2026-07-27' } });
    expect(outcome).toMatchObject({ ok: true, currentStatus: 'delivered', consumedQty: 6 });

    expect((await stocks.getById(batchA))?.physicalQty).toBe(0); // 4 − 4
    expect((await stocks.getById(batchB))?.physicalQty).toBe(8); // 10 − 2
    expect(await reservations.listActiveByOrder(order.id)).toHaveLength(0);
    expect((await orders.getById(order.id))?.deliveryProof).toMatchObject({ by: 'Kurye' });
  });

  it('yolda olmayan sipariş teslim edilemez — stok DEĞİŞMEZ', async () => {
    const { order } = await orders.create({ warehouseId, customerId, channel: 'b2c' }, [{ variantId, qty: 1, unitPriceCents: 1000, vatRate: 5.5 }]);

    const outcome = await deliverOrder(order.id);
    expect(outcome).toMatchObject({ ok: false, reason: 'stale', currentStatus: 'draft' });
    expect((await stocks.getById(batchA))?.physicalQty).toBe(4);
  });

  it('iki kez teslim stoğu İKİ KEZ düşürmez', async () => {
    const order = await sendOut([{ stockId: batchB, qty: 3 }]);
    await deliverOrder(order.id);

    const second = await deliverOrder(order.id);
    expect(second.ok).toBe(false); // artık 'delivered', yolda değil
    expect((await stocks.getById(batchB))?.physicalQty).toBe(7); // tek düşüm
  });

  it('hiç hazırlanmamış sipariş teslim edilirse stok düşmez ama teslim kaydı yazılır', async () => {
    const { order, items } = await orders.create(
      { warehouseId, customerId, channel: 'b2c' },
      [{ variantId, qty: 2, unitPriceCents: 1000, vatRate: 5.5 }],
    );
    for (const d of ['confirmed', 'preparing'] as const) await transitionOrder({ orderId: order.id, to: d });
    await orders.recordPreparation(order.id, [{ orderItemId: items[0]!.id, batches: [] }]); // hiç çıkmadı
    for (const d of ['ready', 'out_for_delivery'] as const) await transitionOrder({ orderId: order.id, to: d });

    expect(await deliverOrder(order.id)).toMatchObject({ ok: true, consumedQty: 0 });
    expect((await stocks.getById(batchA))?.physicalQty).toBe(4);
  });
});

describe('mal maliyeti — sipariş anında tahmin, partiyle kesinleşir', () => {
  it('hazırlıktan önce son alış fiyatlı partiyle tahmin edilir', async () => {
    const { order } = await orders.create({ warehouseId, customerId, channel: 'b2c' }, [{ variantId, qty: 2, unitPriceCents: 1000, vatRate: 5.5 }]);

    expect(await orders.getById(order.id)).toMatchObject({ cogsAmountCents: 600, cogsIsEstimate: true }); // 2 × son parti (3 €)
  });

  it('parti yazılınca her parti kendi alış fiyatından kesinleşir', async () => {
    const order = await sendOut([{ stockId: batchA, qty: 4 }, { stockId: batchB, qty: 2 }]);

    expect(await orders.getById(order.id)).toMatchObject({ cogsAmountCents: 1400, cogsIsEstimate: false }); // 4×2 + 2×3
  });

  it('hiç toplanmamış kalemin tahmini hazırlık bitince düşer', async () => {
    const { order, items } = await orders.create({ warehouseId, customerId, channel: 'b2c' }, [{ variantId, qty: 2, unitPriceCents: 1000, vatRate: 5.5 }]);
    for (const d of ['confirmed', 'preparing'] as const) await transitionOrder({ orderId: order.id, to: d });
    await orders.recordPreparation(order.id, [{ orderItemId: items[0]!.id, batches: [] }]);
    await transitionOrder({ orderId: order.id, to: 'ready' });

    expect(await orders.getById(order.id)).toMatchObject({ cogsAmountCents: 0, cogsIsEstimate: false });
  });
});

describe('kapanış — teslim ve ödeme tamamlanınca kendiliğinden', () => {
  it('parası alınmış sipariş teslimle kapanır', async () => {
    const order = await sendOut([{ stockId: batchB, qty: 1 }]);
    await orders.update({ id: order.id, paymentStatus: 'paid' });

    await deliverOrder(order.id);
    expect((await orders.getById(order.id))?.status).toBe('completed');
  });

  it('parası alınmamış teslimat açık kalır', async () => {
    const order = await sendOut([{ stockId: batchB, qty: 1 }]);

    await deliverOrder(order.id);
    expect((await orders.getById(order.id))?.status).toBe('delivered');
  });
});
