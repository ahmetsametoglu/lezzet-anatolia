import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccountService,
  CategoryService,
  OrderService,
  ProductService,
  ReservationService,
  SettingsService,
  StockService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, mustDelete, purgeTestData, purgeVariantStock } from '@lezzet/database/testing';
import { advanceOrder, prepareOrderToReady } from '../order/advance.testkit';
import { openBox, sealBox } from './boxes';
import { deliverPickupOrder, listPickupQueue } from './pickup';

/**
 * Gel-al teslim kapısı (D9). Her test adını verebildiği bir arızayı yakalar:
 *  · rota siparişi bu kapıdan teslim edilirse (kurye yolu atlanır) → `not_pickup`;
 *  · hazır olmayan gel-al teslim edilirse (mal toplanmadan "verildi" denir) → `not_ready`;
 *  · kutu okutulmadan teslim yazılırsa (yanlış kutu gider) → `boxes_missing`, hiçbir şey değişmez;
 *  · teslimde fiili stok düşmez ya da rezervasyon kalırsa (mal hem gitti hem rafta) → sayılar;
 *  · tahsilat kasaya yazılmaz ya da tekrar anahtarı ikinci yazımı engellemezse → hareket sayısı.
 */
const db = serviceDb();
const stamp = Date.now();
let warehouseId = '';
let categoryId = '';
let productId = '';
let variantId = '';
let stockId = '';
let customerId = '';
let staffId = '';
let accountId = '';

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Gel-al ${stamp}` } })).id;
  const urun = await new ProductService(db).create({
    name: { tr: `Gel-al böreği ${stamp}` },
    categoryId,
    vatRate: 5.5,
    variants: [{ label: { tr: '1 kg' }, sku: `GLA-${stamp}` }],
  });
  productId = urun.product.id;
  variantId = urun.variants[0]!.id;
  stockId = (await new StockService(db).insert({ warehouseId, variantId, physicalQty: 20, expiryDate: '2027-06-01', purchasePriceCents: 800 })).id;
  const profiles = new UserProfileService(db);
  customerId = (await profiles.insert({ name: `Gel-al müşterisi ${stamp}`, phone: `+3364444${String(stamp).slice(-4)}`, pickupAllowed: true })).id;
  staffId = (await profiles.insert({ name: `Gel-al depocusu ${stamp}`, roles: ['warehouse'], warehouseIds: [warehouseId] })).id;
  accountId = (await new AccountService(db).insert({ name: `Kasa gel-al ${stamp}`, type: 'cash' })).id;
});

afterAll(async () => {
  await mustDelete(db, 'settings', (q) => q.eq('key', 'door_cash_account_id').eq('scope_id', warehouseId));
  await mustDelete(db, 'money_movement', (q) => q.eq('account_id', accountId));
  await purgeVariantStock(db, [variantId]);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: [customerId, staffId], warehouseIds: [warehouseId] });
  await mustDelete(db, 'account', (q) => q.eq('id', accountId));
});

/** Hazır gel-al siparişi: onay → kutu aç → partiyi kutuya koy → mühürle (son kutu siparişi `ready` yapar). */
async function readyPickupOrder(qty: number): Promise<{ orderId: string; boxCodes: string[] }> {
  const { order, items } = await new OrderService(db).create(
    { warehouseId, customerId, channel: 'b2c', deliveryType: 'pickup', shippingFeeCents: 0, orderedTotalCents: qty * 1000 },
    [{ variantId, qty, unitPriceCents: 1000, vatRate: 5.5 }],
  );
  await new ReservationService(db).reserve({ orderId: order.id, warehouseId, variantId, qty });
  await advanceOrder(db, order.id, ['confirmed']);
  const opened = await openBox(db, { orderId: order.id, warehouseId });
  if (opened.status !== 'ok') throw new Error(`kutu açılamadı: ${opened.status}`);
  const sealed = await sealBox(db, {
    boxId: opened.box.boxId,
    warehouseId,
    picks: [{ orderItemId: items[0]!.id, batches: [{ stockId, qty }] }],
  });
  if (sealed.status !== 'ok' || !sealed.ready) throw new Error(`kutu mühürlenemedi: ${sealed.status}`);
  return { orderId: order.id, boxCodes: [opened.box.code] };
}

async function stockOf(orderId: string): Promise<{ physical: number; reserved: number }> {
  const row = await new StockService(db).getById(stockId);
  const reserved = (await new ReservationService(db).listActiveByOrder(orderId)).reduce((sum, r) => sum + r.qty, 0);
  return { physical: row?.physicalQty ?? -1, reserved };
}

describe('gel-al kuyruğu', () => {
  it('hazır gel-al siparişi kuyrukta kutularıyla ve borcuyla görünür; hazır rota siparişi görünmez', async () => {
    const { orderId, boxCodes } = await readyPickupOrder(1);
    const rota = await prepareOrderToReady(db, { warehouseId, customerId, variantId, stockId, qty: 1, unitPriceCents: 1000 });

    const queue = await listPickupQueue(db, { warehouseId });
    const row = queue.orders.find((o) => o.orderId === orderId);
    expect(row).toBeDefined();
    expect(row!.boxes.map((b) => b.code)).toEqual(boxCodes);
    expect(row!.amountDueCents).toBe(1000);
    expect(queue.orders.some((o) => o.orderId === rota.orderId)).toBe(false);
  });

  it('kasa ayarı depo kapsamıyla okunur — kuyruk cevabı deponun kasasını taşır', async () => {
    await new SettingsService(db).set('door_cash_account_id', accountId, { scopeType: 'warehouse', scopeId: warehouseId });
    expect((await listPickupQueue(db, { warehouseId })).cashAccountId).toBe(accountId);
  });
});

describe('gel-al teslimi', () => {
  it('rota siparişi bu kapıdan teslim edilemez — kurye yolu atlanamaz', async () => {
    const rota = await prepareOrderToReady(db, { warehouseId, customerId, variantId, stockId, qty: 1, unitPriceCents: 1000 });
    expect((await deliverPickupOrder(db, { orderId: rota.orderId, warehouseId, actorId: staffId, scannedBoxCodes: [] })).status).toBe('not_pickup');
  });

  it('kutular okutulmadan teslim yazılmaz ve hiçbir şey değişmez', async () => {
    const { orderId } = await readyPickupOrder(1);
    const before = await stockOf(orderId);
    const outcome = await deliverPickupOrder(db, { orderId, warehouseId, actorId: staffId, scannedBoxCodes: ['KT-yanlis'] });
    expect(outcome).toMatchObject({ status: 'boxes_missing', remainingBoxNos: [1] });
    expect(await stockOf(orderId)).toEqual(before);
    expect((await new OrderService(db).getById(orderId))?.status).toBe('ready');
  });

  it('tezgâh tahsilatıyla teslim: fiili stok düşer, rezervasyon kapanır, para kasaya yazılır, sipariş kapanır', async () => {
    const { orderId, boxCodes } = await readyPickupOrder(2);
    const before = await stockOf(orderId);
    expect(before.reserved).toBe(2);
    const outcome = await deliverPickupOrder(db, {
      orderId,
      warehouseId,
      actorId: staffId,
      scannedBoxCodes: boxCodes,
      collection: { method: 'card', amountCents: 2000, accountId, idempotencyKey: `gla-${stamp}-${orderId}` },
    });
    expect(outcome).toMatchObject({ status: 'ok', collectedCents: 2000, amountDueCents: 0, paymentStatus: 'paid', cashLimitExceeded: false });
    const after = await stockOf(orderId);
    expect(after.physical).toBe(before.physical - 2);
    expect(after.reserved).toBe(0);
    const order = await new OrderService(db).getById(orderId);
    // Teslim + tam tahsilat = kapanış (`settleOrder`); ödeme yöntemi tezgâhtan yazılır.
    expect(order?.status).toBe('completed');
    expect(order?.paymentMethod).toBe('card');
  });

  it('aynı tahsilat anahtarıyla ikinci istek parayı iki kez yazmaz — durum makinesi ilk kilit', async () => {
    const { orderId, boxCodes } = await readyPickupOrder(1);
    const collection = { method: 'cash' as const, amountCents: 1000, accountId, idempotencyKey: `gla-tekrar-${stamp}-${orderId}` };
    expect((await deliverPickupOrder(db, { orderId, warehouseId, actorId: staffId, scannedBoxCodes: boxCodes, collection })).status).toBe('ok');
    expect((await deliverPickupOrder(db, { orderId, warehouseId, actorId: staffId, scannedBoxCodes: boxCodes, collection })).status).toBe('not_ready');
    const { data } = await db.from('money_movement').select('id').eq('order_id', orderId);
    expect(data?.length).toBe(1);
  });

  it('hazır olmayan gel-al teslim edilemez; başka deponun siparişi de', async () => {
    const { order } = await new OrderService(db).create(
      { warehouseId, customerId, channel: 'b2c', deliveryType: 'pickup', shippingFeeCents: 0, orderedTotalCents: 1000 },
      [{ variantId, qty: 1, unitPriceCents: 1000, vatRate: 5.5 }],
    );
    await new ReservationService(db).reserve({ orderId: order.id, warehouseId, variantId, qty: 1 });
    await advanceOrder(db, order.id, ['confirmed']);
    expect(await deliverPickupOrder(db, { orderId: order.id, warehouseId, actorId: staffId, scannedBoxCodes: [] })).toMatchObject({
      status: 'not_ready',
      currentStatus: 'confirmed',
    });
    const other = await createTestWarehouse(db);
    try {
      expect(await deliverPickupOrder(db, { orderId: order.id, warehouseId: other.id, actorId: staffId, scannedBoxCodes: [] })).toMatchObject({
        status: 'forbidden',
      });
    } finally {
      await purgeTestData(db, { warehouseIds: [other.id] });
    }
  });
});
