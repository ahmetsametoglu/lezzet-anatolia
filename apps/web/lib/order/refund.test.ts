import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, OrderItemBatchService, OrderService, ProductService, ReservationService, StockService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse } from '@lezzet/database/testing';
import { recordOrderPayment } from '../money/order-payment';
import { closeOrder, deliverOrder } from './fulfillment';
import { adjustFulfillment, cancelOrder } from './refund';
import { transitionOrder } from './transition';

/**
 * Kısmi karşılama (07.8) ve iptal/iade (07.9).
 *
 * Doğrulanan iki şey: **iade tutarı türetimden çıkıyor mu** (kupon payı ve kargo dâhil) ve **mal ile
 * para aynı gerçeği mi söylüyor** — geri dönen adet stoğa girerken maliyetin de siparişten çıkması,
 * imha edilende ise kalması gerekir.
 */
const db = serviceDb();
const orders = new OrderService(db);
const itemBatches = new OrderItemBatchService(db);
const stocks = new StockService(db);
const reservations = new ReservationService(db);

const stamp = Date.now();
let customerId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
let variantId: string;
let productId: string;
let categoryId: string;
let batchId: string;
let cashAccount: string;
const createdProfiles: string[] = [];

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `İade testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Mantı ${stamp}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  const profile = await new UserProfileService(db).insert({ name: `İade müşterisi ${stamp}` });
  customerId = profile.id;
  createdProfiles.push(profile.id);
  cashAccount = (await new AccountService(db).insert({ name: `İade kasası ${stamp}`, type: 'cash' })).id;
});

beforeEach(async () => {
  await db.from('money_movement').delete().eq('account_id', cashAccount);
  await db.from('order').delete().eq('customer_id', customerId);
  await db.from('reservation').delete().eq('variant_id', variantId);
  const previous = await db.from('stock').select('id').eq('variant_id', variantId);
  const ids = (previous.data ?? []).map((row) => row.id as string);
  if (ids.length > 0) await db.from('stock_adjustment').delete().in('stock_id', ids);
  await db.from('stock').delete().eq('variant_id', variantId);
  batchId = (await stocks.insert({ warehouseId, variantId, physicalQty: 10, expiryDate: dayOffset(30), purchasePrice: 4 })).id;
});

afterAll(async () => {
  await db.from('money_movement').delete().eq('account_id', cashAccount);
  await db.from('order').delete().eq('customer_id', customerId);
  // Rezervasyonun siparişe FK'sı yok (0007) — elle temizlenir, yoksa TTL süpürme testini yanıltır.
  await db.from('reservation').delete().eq('variant_id', variantId);
  await db.from('account').delete().eq('id', cashAccount);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: createdProfiles });
  await db.from('warehouse').delete().eq('id', warehouseId);
});

/** Sipariş aç → ayır → hazırla. Kalem tek: `qty` adet, birim 10 €. Durum `ready`'de bırakılır. */
async function prepare(qty: number, extra: { shippingFee?: number; lineDiscountAmount?: number } = {}) {
  const { order, items } = await orders.create(
    // Başlıktaki indirim kalem paylarının toplamıdır ve bunu artık veritabanı zorluyor (0041) —
    // tek kalemli fikstürde ikisi aynı sayı.
    {
      warehouseId,
      customerId,
      channel: 'b2c',
      deliveryType: 'route',
      shippingFee: extra.shippingFee ?? 0,
      discountAmount: extra.lineDiscountAmount ?? 0,
    },
    [{ variantId, qty, unitPrice: 10, vatRate: 5.5, lineDiscountAmount: extra.lineDiscountAmount ?? 0 }],
  );
  await reservations.reserve({ orderId: order.id, warehouseId, variantId, qty });
  for (const status of ['confirmed', 'preparing'] as const) await transitionOrder({ orderId: order.id, to: status });
  await orders.recordPreparation(order.id, [{ orderItemId: items[0]!.id, batches: [{ stockId: batchId, qty }] }]);
  await transitionOrder({ orderId: order.id, to: 'ready' });
  return { orderId: order.id, itemId: items[0]!.id };
}

/** Hazırlananı yola çıkarır — teslime hazır hâl. */
async function sendOut(qty: number, extra: { shippingFee?: number; lineDiscountAmount?: number } = {}) {
  const prepared = await prepare(qty, extra);
  await transitionOrder({ orderId: prepared.orderId, to: 'out_for_delivery' });
  return prepared;
}

describe('kısmi karşılama (07.8)', () => {
  it('peşin ödenmiş siparişte eksik kalemin farkı OTOMATİK iade edilir', async () => {
    const { orderId, itemId } = await sendOut(3);
    await recordOrderPayment({ orderId, accountId: cashAccount, amount: 30 });

    const outcome = await adjustFulfillment(orderId, [{ orderItemId: itemId, fulfilledQty: 2 }]);

    expect(outcome).toMatchObject({ status: 'ok', refundedAmount: 10, paymentStatus: 'paid' });
    const order = await orders.getById(orderId);
    expect(order).toMatchObject({ amountCollected: 30, amountRefunded: 10, paymentStatus: 'paid' });
  });

  it('kuponlu + kargolu siparişte iade tutarı KALEMİN payından hesaplanır', async () => {
    // 3 × 10 € = 30, kupon payı 6 €, kargo 5 € → tahsilat 29 €.
    const { orderId, itemId } = await sendOut(3, { shippingFee: 5, lineDiscountAmount: 6 });
    await recordOrderPayment({ orderId, accountId: cashAccount, amount: 29 });

    const outcome = await adjustFulfillment(orderId, [{ orderItemId: itemId, fulfilledQty: 2 }]);

    // Karşılanan: 2 × 10 − (6 × 2/3) + 5 kargo = 21 → iade 8. Kupon payı bölünmeseydi 10 çıkardı.
    expect(outcome).toMatchObject({ status: 'ok', refundedAmount: 8, paymentStatus: 'paid' });
  });

  it('kapıda ödenecek siparişte iade YAZILMAZ, tahsil edilecek tutar düşer', async () => {
    const { orderId, itemId } = await sendOut(3, { shippingFee: 5 });

    const outcome = await adjustFulfillment(orderId, [{ orderItemId: itemId, fulfilledQty: 1 }]);

    expect(outcome).toMatchObject({ status: 'ok', refundedAmount: 0, paymentStatus: 'pending', amountToCollect: 15 });
    expect((await orders.getById(orderId))?.amountRefunded).toBe(0);
  });

  it('teslim edilmemiş eksik mal ayrılmıştan geri bırakılır, fiili stok DEĞİŞMEZ', async () => {
    const { orderId, itemId } = await sendOut(4);

    const outcome = await adjustFulfillment(orderId, [{ orderItemId: itemId, fulfilledQty: 1 }]);

    expect(outcome).toMatchObject({ status: 'ok', releasedQty: 3, restockedQty: 0 });
    expect((await stocks.getById(batchId))?.physicalQty).toBe(10); // teslim olmadı, düşüm de yok
    const active = await reservations.listActiveByOrder(orderId);
    expect(active.reduce((sum, row) => sum + row.qty, 0)).toBe(1);
  });

  it('gitmeyen mal COGS’a girmez — kalem–parti kaydı da düşer', async () => {
    const { orderId, itemId } = await sendOut(4);
    await adjustFulfillment(orderId, [{ orderItemId: itemId, fulfilledQty: 1 }]);
    await deliverOrder(orderId);

    expect(await closeOrder(orderId)).toMatchObject({ ok: true, cogsAmount: 4 }); // 1 × 4 €, 4 × 4 değil
    expect((await stocks.getById(batchId))?.physicalQty).toBe(9);
  });
});

describe('teslim sonrası iade — malın nereye gittiği maliyeti belirler (DOMAIN §8)', () => {
  it('restock: mal depoya geri girer, maliyeti siparişten çıkar', async () => {
    const { orderId, itemId } = await sendOut(3);
    await recordOrderPayment({ orderId, accountId: cashAccount, amount: 30 });
    await deliverOrder(orderId);
    expect((await stocks.getById(batchId))?.physicalQty).toBe(7);

    const outcome = await adjustFulfillment(orderId, [
      { orderItemId: itemId, fulfilledQty: 1, returnDisposition: 'restock', note: 'Müşteri iade etti' },
    ]);

    expect(outcome).toMatchObject({ status: 'ok', restockedQty: 2, refundedAmount: 20 });
    expect((await stocks.getById(batchId))?.physicalQty).toBe(9); // 7 + 2
    expect(await closeOrder(orderId)).toMatchObject({ ok: true, cogsAmount: 4 }); // yalnız kalan 1 adet
  });

  it('discard: fiili stok DEĞİŞMEZ (ikinci kez düşemez), maliyet siparişte kalır', async () => {
    const { orderId, itemId } = await sendOut(3);
    await recordOrderPayment({ orderId, accountId: cashAccount, amount: 30 });
    await deliverOrder(orderId);

    const outcome = await adjustFulfillment(orderId, [
      { orderItemId: itemId, fulfilledQty: 1, returnDisposition: 'discard', note: 'Soğuk zincir kırıldı' },
    ]);

    expect(outcome).toMatchObject({ status: 'ok', restockedQty: 0, refundedAmount: 20 });
    expect((await stocks.getById(batchId))?.physicalQty).toBe(7); // teslimdeki düşüm, tek sefer
    expect(await closeOrder(orderId)).toMatchObject({ ok: true, cogsAmount: 12 }); // 3 × 4 — kayıp kârda görünür
  });

  it('goodwill: mal müşteride kalır — miktar da stok da değişmez, tutarı operatör verir', async () => {
    const { orderId, itemId } = await sendOut(2);
    await recordOrderPayment({ orderId, accountId: cashAccount, amount: 20 });
    await deliverOrder(orderId);

    const outcome = await adjustFulfillment(
      orderId,
      [{ orderItemId: itemId, fulfilledQty: 2, returnDisposition: 'goodwill' }],
      { refundAmount: 20 },
    );

    expect(outcome).toMatchObject({ status: 'ok', refundedAmount: 20, paymentStatus: 'refunded' });
    expect((await stocks.getById(batchId))?.physicalQty).toBe(8); // mal geri gelmedi
    const items = await orders.getWithItems(orderId);
    expect(items?.items[0]).toMatchObject({ fulfilledQty: 2, returnDisposition: 'goodwill' });
  });

  it('iade süreci kapanışı: `returned` durumundan da kapanır (ORDER_LIFECYCLE)', async () => {
    const { orderId, itemId } = await sendOut(2);
    await deliverOrder(orderId);
    await adjustFulfillment(orderId, [{ orderItemId: itemId, fulfilledQty: 0, returnDisposition: 'restock', note: 'Tamamı döndü' }]);
    await transitionOrder({ orderId, to: 'returned' });

    expect(await closeOrder(orderId)).toMatchObject({ ok: true, currentStatus: 'completed', cogsAmount: 0 });
  });
});

describe('iptal (07.9)', () => {
  it('ödenmiş sipariş iptalinde TAMAMI iade edilir, ayrılmış geri bırakılır', async () => {
    const { orderId } = await prepare(3);
    await recordOrderPayment({ orderId, accountId: cashAccount, amount: 30 });

    const outcome = await cancelOrder(orderId);

    expect(outcome).toMatchObject({ status: 'ok', refundedAmount: 30, paymentStatus: 'refunded', releasedQty: 3 });
    expect((await orders.getById(orderId))?.status).toBe('cancelled');
    expect(await reservations.listActiveByOrder(orderId)).toHaveLength(0);
    expect((await stocks.getById(batchId))?.physicalQty).toBe(10); // mal hiç çıkmadı
  });

  it('ödenmemiş sipariş iptalinde hareket yazılmaz, durum `pending` kalır', async () => {
    const { orderId } = await prepare(2);

    const outcome = await cancelOrder(orderId);

    expect(outcome).toMatchObject({ status: 'ok', refundedAmount: 0, paymentStatus: 'pending' });
    expect((await orders.getById(orderId))?.amountRefunded).toBe(0);
  });

  it('hazırlanmış mal iptalde "müşteride" sayılmaz — kalem–parti kaydı silinir', async () => {
    const { orderId } = await prepare(3);
    await cancelOrder(orderId);

    expect(await itemBatches.listByOrder(orderId)).toHaveLength(0);
    expect((await stocks.getById(batchId))?.physicalQty).toBe(10);
  });

  it('yoldaki sipariş iptal edilemez — kapıdan dönen mal `returned` yolundan gider', async () => {
    const { orderId } = await sendOut(2);

    expect(await cancelOrder(orderId)).toMatchObject({ status: 'forbidden', reason: 'not_allowed' });
    expect((await orders.getById(orderId))?.status).toBe('out_for_delivery');
  });

  it('teslim edilmiş sipariş iptal edilemez — iade yoluna girer', async () => {
    const { orderId } = await sendOut(1);
    await deliverOrder(orderId);

    expect(await cancelOrder(orderId)).toMatchObject({ status: 'forbidden', reason: 'not_allowed' });
    expect((await orders.getById(orderId))?.status).toBe('delivered');
  });
});
