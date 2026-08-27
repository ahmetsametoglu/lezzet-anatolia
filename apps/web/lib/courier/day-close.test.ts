import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, DeliveryZoneService, OrderService, ProductService, ReservationService,
  StockService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { startCourierDay } from '@lezzet/application';
import { purgeTestData, createTestWarehouse, purgeVariantStock, mustDelete } from '@lezzet/database/testing';
import { closeCourierDay, openDayClose, type DayCloseDraft } from './day-close';
import { confirmDoorDelivery } from './delivery';
import { markUndelivered } from './day';
import { transitionOrder } from '../order/transition';

/**
 * SEFER kapanışı ve kasa mutabakatı — WEB KÖPRÜSÜ (11.7 · 18.08). Davranışın tam kapsamı paket
 * testinde (`packages/application/src/courier/day-close.test.ts`); burada sınanan şey köprünün
 * (serviceDb enjeksiyonu) aynı sonuçları taşıdığıdır: **beklenen toplam yöntem bazında doğru mu**,
 * **fark aynı gün görünüyor mu**, **kapanmış sefer salt-okunur mu**.
 *
 * `startCourierDay` köprüde YOK ve bilinçli (web ekranı kullanmıyor — knip ölü kod sayar); testin
 * fikstürü seferi doğrudan paketten başlatır.
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
/** Sefer akışının rotası: claim zone süzgeçli, zonesuz sipariş sefere bağlanmaz. */
let zoneId: string;
const createdProfiles: string[] = [];

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
/** Her test kendi gününde çalışır: sefer (rota, gün) çiftinde TEKİLDİR (0046). */
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
  const customer = await profiles.insert({ name: 'Paul Roux', email: `kapanis-web-${stamp}@example.test` });
  const courier = await profiles.insert({ name: 'Kurye Deniz', email: `deniz-web-${stamp}@example.test` });
  customerId = customer.id;
  courierId = courier.id;
  createdProfiles.push(customer.id, courier.id);
  // Kurye rol + depo kapsamıyla açılır (11.7): boş kapsam fail-closed `no_route` demek.
  await profiles.setRoles(courierId, ['courier'], [warehouseId]);

  accountId = (await new AccountService(db).insert({ name: `Kapanış kasası ${stamp}`, type: 'cash' })).id;
  // Rota HER GÜN koşar: testin hangi gün koştuğu davranışı değiştirmesin.
  zoneId = (await new DeliveryZoneService(db).insert({
    name: `Kapanış web rotası ${stamp}`, warehouseId, weekdays: [1, 2, 3, 4, 5, 6, 7],
  })).id;
});

beforeEach(async () => {
  // Sefer temizliği: kapanış seferi `restrict` ile tutar — sıra sabit (close → run).
  const { data: runRows } = await db.from('delivery_run').select('id').eq('delivery_zone_id', zoneId);
  const runIds = (runRows ?? []).map((row) => row.id as string);
  if (runIds.length > 0) {
    await db.from('delivery_run_close').delete().in('delivery_run_id', runIds);
    await db.from('delivery_run').delete().in('id', runIds);
  }
  // SIRA: defter → parti → sipariş (06.14) — künye `packages/application/src/courier/day.test.ts`te.
  await purgeVariantStock(db, [variantId]);
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  await mustDelete(db, 'reservation', (q) => q.eq('variant_id', variantId));
  stockId = (await stocks.insert({ warehouseId, variantId, physicalQty: 60, expiryDate: dayOffset(60), purchasePriceCents: 200 })).id;
  day = dayOffset(++dayCounter);
});

afterAll(async () => {
  // Sefer, kapanışı, sipariş ve rezervasyon AYRICA silinmez: hepsi `purgeTestData`'nın bildiği
  // bağlar. Elle yazılan satırlar teardown'ı öldürüyordu (ölçüldü 14.08, `cleanup.ts` künyesi).
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    accountIds: [accountId],
    warehouseIds: [warehouseId],
  });
});

/** HAZIR durak — sefere claim edilmeye hazır; yola çıkışı `depart()` yazar. */
async function atTheDoor(qty: number) {
  const { order, items } = await orders.create(
    {
      warehouseId, customerId, channel: 'b2c', deliveryType: 'route',
      deliveryZoneId: zoneId, deliveryDate: day, courierId, totalCents: qty * 1000,
    },
    [{ variantId, qty, unitPriceCents: 1000, vatRate: 5.5 }],
  );
  await reservations.reserve({ orderId: order.id, warehouseId, variantId, qty });
  for (const status of ['confirmed', 'preparing'] as const) await transitionOrder({ orderId: order.id, to: status });
  await orders.recordPreparation(order.id, [{ orderItemId: items[0]!.id, batches: [{ stockId, qty }] }]);
  await transitionOrder({ orderId: order.id, to: 'ready' });
  return { orderId: order.id, itemId: items[0]!.id, qty };
}

/** Seferi başlat — günün hazır durakları claim edilir ve yola çıkar; seferin kimliği döner. */
async function depart(): Promise<string> {
  const result = await startCourierDay(db, { courierId, zoneId, date: day });
  if (result.status !== 'ok') throw new Error(`sefer başlamalıydı, gelen: ${result.status}`);
  return result.run.runId;
}

/** Kapıda tahsilat — kapanışın beklenen toplamını besleyen tek yol. */
async function collect(orderId: string, qty: number, method: 'cash' | 'card' | 'cheque') {
  await confirmDoorDelivery({ orderId, courierId, collection: { method, amountCents: qty * 1000, accountId } });
}

describe('kapanış taslağı (köprü)', () => {
  it('beklenen tahsilat YÖNTEM BAZINDA, SEFERİN duraklarından toplanır', async () => {
    const a = await atTheDoor(3); // 30 €
    const b = await atTheDoor(2); // 20 €
    const c = await atTheDoor(4); // 40 €
    const runId = await depart();
    await collect(a.orderId, a.qty, 'cash');
    await collect(b.orderId, b.qty, 'cash');
    await collect(c.orderId, c.qty, 'card');

    const draft: DayCloseDraft = await openDayClose({ courierId, runId });

    expect(draft.run?.runId).toBe(runId);
    expect(draft.expected).toEqual({ cashCents: 5000, cardCents: 4000, chequeCents: 0 });
    expect(draft.delivered).toHaveLength(3);
  });

  it('seferin üç akıbeti ayrı listelerde durur', async () => {
    const teslim = await atTheDoor(2);
    const { orderId: ulasilamayan } = await atTheDoor(1);
    const { orderId: reddedilen } = await atTheDoor(1);
    await depart();
    await collect(teslim.orderId, teslim.qty, 'cash');
    await markUndelivered({ orderId: ulasilamayan, courierId, outcome: 'unreachable' });
    await markUndelivered({ orderId: reddedilen, courierId, outcome: 'refused' });

    // runId verilmeden açılır: kuryenin o günkü seferi bulunur (ekranın varsayılan yolu).
    const draft = await openDayClose({ courierId, date: day });

    expect(draft.delivered).toHaveLength(1);
    expect(draft.pending.map((stop) => stop.orderId)).toEqual([ulasilamayan]);
    expect(draft.returned.map((stop) => stop.orderId)).toEqual([reddedilen]);
  });

  it('sefersiz gün sakin bir boşluktur — run yok, sıfır gösterilir', async () => {
    const draft = await openDayClose({ courierId, date: day });

    expect(draft.run).toBeNull();
    expect(draft.expected).toEqual({ cashCents: 0, cardCents: 0, chequeCents: 0 });
    expect(draft.closed).toBeNull();
  });
});

describe('seferi kapat (köprü)', () => {
  it('sayılan beklenene eşitse sefer MUTABIK kapanır', async () => {
    const a = await atTheDoor(3);
    const runId = await depart();
    await collect(a.orderId, a.qty, 'cash');

    const result = await closeCourierDay({ courierId, runId, countedCashCents: 3000 });

    expect(result).toMatchObject({ ok: true, reconciled: true, differenceCashCents: 0, deliveredCount: 1 });
  });

  it('fark AYNI GÜN görünür ve işareti anlamlıdır', async () => {
    const a = await atTheDoor(5); // beklenen 50 €
    const runId = await depart();
    await collect(a.orderId, a.qty, 'cash');

    const eksik = await closeCourierDay({ courierId, runId, countedCashCents: 4500, note: 'müşteri bozuk para veremedi' });

    expect(eksik).toMatchObject({ ok: true, reconciled: false, differenceCashCents: -500 });
    expect(eksik.differenceCashCents).toBeLessThan(0);
  });

  it('takılı durak kapanışta çözülür, kapanmış sefer İKİNCİ kez kapatılamaz', async () => {
    const teslim = await atTheDoor(2);
    const { orderId: takili } = await atTheDoor(1);
    const runId = await depart();
    await collect(teslim.orderId, teslim.qty, 'cash');

    const first = await closeCourierDay({ courierId, runId, countedCashCents: 2000 });
    expect(first).toMatchObject({ ok: true, deliveredCount: 1, pendingCount: 1, releasedCount: 1 });
    expect((await orders.getById(takili))?.status).toBe('ready');

    const second = await closeCourierDay({ courierId, runId, countedCashCents: 99900 });
    expect(second).toMatchObject({ ok: false, reason: 'already_closed', id: first.id });

    const draft = await openDayClose({ courierId, runId });
    expect(draft.closed?.countedCashCents).toBe(2000); // ilk sayım yerinde
  });
});
