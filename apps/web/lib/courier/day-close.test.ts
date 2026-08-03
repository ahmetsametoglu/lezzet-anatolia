import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, OrderService, ProductService, ReservationService, StockService,
  UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse } from '@lezzet/database/testing';
import { closeCourierDay, openDayClose, type DayCloseDraft } from './day-close';
import { confirmDoorDelivery } from './delivery';
import { markUndelivered } from './day';
import { transitionOrder } from '../order/transition';

/**
 * Kurye gün kapanışı ve kasa mutabakatı (11.6).
 *
 * Sınanan şey: **beklenen toplam yöntem bazında doğru mu**, **fark aynı gün görünüyor mu** ve
 * **kapanmış gün salt-okunur mu**.
 */
const db = serviceDb();
const orders = new OrderService(db);
const stocks = new StockService(db);
const reservations = new ReservationService(db);

const stamp = Date.now();
let customerId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
let courierId: string;
let variantId: string;
let productId: string;
let categoryId: string;
let stockId: string;
let accountId: string;
const createdProfiles: string[] = [];

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
/** Her test kendi gününde çalışır: kapanış (kurye, gün) çiftinde TEKİLDİR. */
let day: string;
let dayCounter = 0;

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `Kapanış testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Lokum ${stamp}` },
    categoryId: category.id,
    variants: [{ label: { tr: '300 g' } }],
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;

  const profiles = new UserProfileService(db);
  const customer = await profiles.insert({ name: 'Paul Roux', email: `kapanis-${stamp}@example.test` });
  const courier = await profiles.insert({ name: 'Kurye Deniz', email: `deniz-${stamp}@example.test` });
  customerId = customer.id;
  courierId = courier.id;
  createdProfiles.push(customer.id, courier.id);

  accountId = (await new AccountService(db).insert({ name: `Kapanış kasası ${stamp}`, type: 'cash' })).id;
});

beforeEach(async () => {
  await db.from('courier_day_close').delete().eq('courier_id', courierId);
  await db.from('order').delete().eq('customer_id', customerId);
  await db.from('reservation').delete().eq('variant_id', variantId);
  await db.from('stock').delete().eq('variant_id', variantId);
  stockId = (await stocks.insert({ warehouseId, variantId, physicalQty: 60, expiryDate: dayOffset(60), purchasePriceCents: 200 })).id;
  day = dayOffset(++dayCounter);
});

afterAll(async () => {
  await db.from('courier_day_close').delete().eq('courier_id', courierId);
  await db.from('order').delete().eq('customer_id', customerId);
  await db.from('reservation').delete().eq('variant_id', variantId);
  await db.from('account').delete().eq('id', accountId);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: createdProfiles });
  await db.from('warehouse').delete().eq('id', warehouseId);
});

async function atTheDoor(qty: number) {
  const { order, items } = await orders.create(
    { warehouseId, customerId, channel: 'b2c', deliveryType: 'route', deliveryDate: day, courierId, total: qty * 10 },
    [{ variantId, qty, unitPrice: 10, vatRate: 5.5 }],
  );
  await reservations.reserve({ orderId: order.id, warehouseId, variantId, qty });
  for (const status of ['confirmed', 'preparing'] as const) await transitionOrder({ orderId: order.id, to: status });
  await orders.recordPreparation(order.id, [{ orderItemId: items[0]!.id, batches: [{ stockId, qty }] }]);
  for (const status of ['ready', 'out_for_delivery'] as const) await transitionOrder({ orderId: order.id, to: status });
  return { orderId: order.id, itemId: items[0]!.id };
}

/** Teslim + kapıda tahsilat — kapanışın beklenen toplamını besleyen tek yol. */
async function deliverAndCollect(qty: number, method: 'cash' | 'card' | 'cheque') {
  const { orderId } = await atTheDoor(qty);
  await confirmDoorDelivery({ orderId, courierId, collection: { method, amount: qty * 10, accountId } });
  return orderId;
}

describe('kapanış taslağı', () => {
  it('beklenen tahsilat YÖNTEM BAZINDA toplanır', async () => {
    await deliverAndCollect(3, 'cash'); // 30 €
    await deliverAndCollect(2, 'cash'); // 20 €
    await deliverAndCollect(4, 'card'); // 40 €

    const draft: DayCloseDraft = await openDayClose({ courierId, date: day });

    // Yöntemler karışırsa mutabakat yapılamaz: nakit sayımla, kart cihaz raporuyla karşılaşır.
    expect(draft.expected).toEqual({ cashCents: 5000, cardCents: 4000, chequeCents: 0 });
    expect(draft.delivered).toHaveLength(3);
  });

  it('günün üç akıbeti ayrı listelerde durur', async () => {
    await deliverAndCollect(2, 'cash');
    const { orderId: ulasilamayan } = await atTheDoor(1);
    const { orderId: reddedilen } = await atTheDoor(1);
    await markUndelivered({ orderId: ulasilamayan, courierId, outcome: 'unreachable' });
    await markUndelivered({ orderId: reddedilen, courierId, outcome: 'refused' });

    const draft = await openDayClose({ courierId, date: day });

    expect(draft.delivered).toHaveLength(1);
    expect(draft.pending.map((stop) => stop.orderId)).toEqual([ulasilamayan]);
    expect(draft.returned.map((stop) => stop.orderId)).toEqual([reddedilen]);
  });

  it('tahsilatsız gün sıfır gösterir — "veri yok" ile "para yok" aynıdır', async () => {
    const draft = await openDayClose({ courierId, date: day });

    expect(draft.expected).toEqual({ cashCents: 0, cardCents: 0, chequeCents: 0 });
    expect(draft.closed).toBeNull();
  });
});

describe('günü kapat', () => {
  it('sayılan beklenene eşitse gün MUTABIK kapanır', async () => {
    await deliverAndCollect(3, 'cash');

    const result = await closeCourierDay({ courierId, date: day, countedCashCents: 3000 });

    expect(result).toMatchObject({ ok: true, reconciled: true, differenceCashCents: 0, deliveredCount: 1 });
  });

  it('fark AYNI GÜN görünür ve işareti anlamlıdır', async () => {
    await deliverAndCollect(5, 'cash'); // beklenen 50 €

    const eksik = await closeCourierDay({ courierId, date: day, countedCashCents: 4500, note: 'müşteri bozuk para veremedi' });

    expect(eksik).toMatchObject({ ok: true, reconciled: false, differenceCashCents: -500 });
    // Eksi eksik teslim, artı fazla para: ikisi de açıklanmayı hak eder, mutlak değere indirilmez.
    expect(eksik.differenceCashCents).toBeLessThan(0);
  });

  it('fazla para da fark sayılır', async () => {
    await deliverAndCollect(2, 'cash'); // beklenen 20 €

    const fazla = await closeCourierDay({ courierId, date: day, countedCashCents: 2500 });

    expect(fazla).toMatchObject({ reconciled: false, differenceCashCents: 500 });
  });

  it('sonuçlanmamış durak kapanışı ENGELLEMEZ, sayılır', async () => {
    await deliverAndCollect(2, 'cash');
    const { orderId } = await atTheDoor(1);
    await markUndelivered({ orderId, courierId, outcome: 'unreachable' });

    const result = await closeCourierDay({ courierId, date: day, countedCashCents: 2000 });

    // Kurye depoya döndüyse günü kapatabilmeli; ulaşılamayan sipariş yarına kalır.
    expect(result).toMatchObject({ ok: true, deliveredCount: 1, pendingCount: 1 });
  });

  it('kapanmış gün İKİNCİ kez kapatılamaz — kayıt ezilmez', async () => {
    await deliverAndCollect(2, 'cash');
    const first = await closeCourierDay({ courierId, date: day, countedCashCents: 2000 });

    const second = await closeCourierDay({ courierId, date: day, countedCashCents: 99900 });

    expect(second).toMatchObject({ ok: false, reason: 'already_closed', id: first.id });
    const draft = await openDayClose({ courierId, date: day });
    expect(draft.closed?.countedCashCents).toBe(2000); // ilk sayım yerinde
  });

  it('kapanış sonrası hareket düzeltilse bile BEKLENEN donmuş kalır', async () => {
    const orderId = await deliverAndCollect(3, 'cash'); // beklenen 30 €
    await closeCourierDay({ courierId, date: day, countedCashCents: 3000 });

    // Ertesi gün biri hareketi düzeltiyor — o gün ne konuşulduğu değişmemeli.
    await db.from('money_movement').delete().eq('order_id', orderId);

    const draft = await openDayClose({ courierId, date: day });
    expect(draft.closed?.expectedCashCents).toBe(3000);
    expect(draft.expected.cashCents).toBe(0); // canlı türetim değişti, kapanış kaydı değişmedi
  });
});
