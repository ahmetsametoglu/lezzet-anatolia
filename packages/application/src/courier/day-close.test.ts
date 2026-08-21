import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, DeliveryZoneService, OrderService, ProductService, ReservationService,
  StockService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse } from '@lezzet/database/testing';
import { closeCourierDay, openDayClose, type DayCloseDraft } from './day-close';
import { confirmDoorDelivery } from './delivery';
import { markUndelivered, startCourierDay } from './day';
import { advanceOrder } from '../order/advance.testkit';

/**
 * SEFER kapanışı ve kasa mutabakatı (11.7 · 18.08 — kurye×gün kapanışının halefi).
 *
 * Sınanan şey: **beklenen toplam yöntem bazında doğru mu**, **fark aynı gün görünüyor mu**,
 * **kapanmış sefer salt-okunur mu** ve **takılı duraklar kapanışta çözülüyor mu** (K4).
 *
 * Akış artık seferlidir: duraklar `startCourierDay` claim'iyle sefere bağlanır — kapanış GÜNÜN
 * değil SEFERİN duraklarını sayar.
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
  const customer = await profiles.insert({ name: 'Paul Roux', email: `kapanis-${stamp}@example.test` });
  const courier = await profiles.insert({ name: 'Kurye Deniz', email: `deniz-${stamp}@example.test` });
  customerId = customer.id;
  courierId = courier.id;
  createdProfiles.push(customer.id, courier.id);
  // Kurye rol + depo kapsamıyla açılır (11.7): boş kapsam fail-closed `no_route` demek.
  await profiles.setRoles(courierId, ['courier'], [warehouseId]);

  accountId = (await new AccountService(db).insert({ name: `Kapanış kasası ${stamp}`, type: 'cash' })).id;
  // Rota HER GÜN koşar: testin hangi gün koştuğu davranışı değiştirmesin.
  zoneId = (await new DeliveryZoneService(db).insert({
    name: `Kapanış rotası ${stamp}`, warehouseId, weekdays: [1, 2, 3, 4, 5, 6, 7],
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
  await db.from('order').delete().eq('customer_id', customerId);
  await db.from('reservation').delete().eq('variant_id', variantId);
  await db.from('stock').delete().eq('variant_id', variantId);
  stockId = (await stocks.insert({ warehouseId, variantId, physicalQty: 60, expiryDate: dayOffset(60), purchasePriceCents: 200 })).id;
  day = dayOffset(++dayCounter);
});

afterAll(async () => {
  // Sefer, kapanışı, sipariş ve rezervasyon AYRICA silinmez: hepsi `purgeTestData`'nın bildiği
  // bağlar (sefer `warehouseIds`/`profileIds`ten, sipariş `profileIds`ten, rezervasyon
  // `productIds`ten). Elle yazılan satırlar teardown'ı öldürüyordu (ölçüldü 14.08).
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
  await advanceOrder(db, order.id, ['confirmed', 'preparing']);
  await orders.recordPreparation(order.id, [{ orderItemId: items[0]!.id, batches: [{ stockId, qty }] }]);
  await advanceOrder(db, order.id, ['ready']);
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
  await confirmDoorDelivery(db, { orderId, courierId, collection: { method, amountCents: qty * 1000, accountId } });
}

describe('kapanış taslağı', () => {
  it('beklenen tahsilat YÖNTEM BAZINDA, SEFERİN duraklarından toplanır', async () => {
    const a = await atTheDoor(3); // 30 €
    const b = await atTheDoor(2); // 20 €
    const c = await atTheDoor(4); // 40 €
    const runId = await depart();
    await collect(a.orderId, a.qty, 'cash');
    await collect(b.orderId, b.qty, 'cash');
    await collect(c.orderId, c.qty, 'card');

    const draft: DayCloseDraft = await openDayClose(db, { courierId, runId });

    // Yöntemler karışırsa mutabakat yapılamaz: nakit sayımla, kart cihaz raporuyla karşılaşır.
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
    await markUndelivered(db, { orderId: ulasilamayan, courierId, outcome: 'unreachable' });
    await markUndelivered(db, { orderId: reddedilen, courierId, outcome: 'refused' });

    // runId verilmeden açılır: kuryenin o günkü seferi bulunur (mobil K7'nin varsayılan yolu).
    const draft = await openDayClose(db, { courierId, date: day });

    expect(draft.delivered).toHaveLength(1);
    expect(draft.pending.map((stop) => stop.orderId)).toEqual([ulasilamayan]);
    expect(draft.returned.map((stop) => stop.orderId)).toEqual([reddedilen]);
  });

  it('sefersiz gün sakin bir boşluktur — run yok, sıfır gösterilir', async () => {
    const draft = await openDayClose(db, { courierId, date: day });

    expect(draft.run).toBeNull();
    expect(draft.expected).toEqual({ cashCents: 0, cardCents: 0, chequeCents: 0 });
    expect(draft.closed).toBeNull();
  });
});

describe('seferi kapat', () => {
  it('sayılan beklenene eşitse sefer MUTABIK kapanır ve dönüş damgalanır', async () => {
    const a = await atTheDoor(3);
    const runId = await depart();
    await collect(a.orderId, a.qty, 'cash');

    const result = await closeCourierDay(db, { courierId, runId, countedCashCents: 3000 });

    expect(result).toMatchObject({ ok: true, reconciled: true, differenceCashCents: 0, deliveredCount: 1 });
    expect(result.returnedAt).toBeTruthy();
  });

  it('fark AYNI GÜN görünür ve işareti anlamlıdır', async () => {
    const a = await atTheDoor(5); // beklenen 50 €
    const runId = await depart();
    await collect(a.orderId, a.qty, 'cash');

    const eksik = await closeCourierDay(db, { courierId, runId, countedCashCents: 4500, note: 'müşteri bozuk para veremedi' });

    expect(eksik).toMatchObject({ ok: true, reconciled: false, differenceCashCents: -500 });
    // Eksi eksik teslim, artı fazla para: ikisi de açıklanmayı hak eder, mutlak değere indirilmez.
    expect(eksik.differenceCashCents).toBeLessThan(0);
  });

  it('fazla para da fark sayılır', async () => {
    const a = await atTheDoor(2); // beklenen 20 €
    const runId = await depart();
    await collect(a.orderId, a.qty, 'cash');

    const fazla = await closeCourierDay(db, { courierId, runId, countedCashCents: 2500 });

    expect(fazla).toMatchObject({ reconciled: false, differenceCashCents: 500 });
  });

  it('takılı `out_for_delivery` durak kapanışta ÇÖZÜLÜR — fotoğrafta pending, durumda ready (K4)', async () => {
    const teslim = await atTheDoor(2);
    const { orderId: takili } = await atTheDoor(1);
    const runId = await depart();
    await collect(teslim.orderId, teslim.qty, 'cash');
    // `takili` kapıda hiç işaretlenmedi — eskiden kimsenin ulaşamadığı kilitte kalırdı.

    const result = await closeCourierDay(db, { courierId, runId, countedCashCents: 2000 });

    // Kapanış engellenmez; fotoğraf çözümden ÖNCE çekilir (o an pending idi), sonra durak çözülür.
    expect(result).toMatchObject({ ok: true, deliveredCount: 1, pendingCount: 1, releasedCount: 1 });
    const order = await orders.getById(takili);
    expect(order?.status).toBe('ready');
    // Gün İLERLETİLMEZ: tarih sevkiyatçının kararı (16.08 "görünür devir" korunur).
    expect(order?.deliveryDate).toBe(day);

    const { data } = await db.from('order_status_log').select('to_status,note').eq('order_id', takili);
    expect((data ?? []).some((row) => row.to_status === 'ready' && row.note?.includes('Sefer kapandı'))).toBe(true);
  });

  it('kuryenin KAPIDA verdiği hüküm kapanışça ezilmez — ulaşılamadı `pending` sayılır, yeniden çözülmez', async () => {
    const teslim = await atTheDoor(2);
    const { orderId: ulasilamayan } = await atTheDoor(1);
    const runId = await depart();
    await collect(teslim.orderId, teslim.qty, 'cash');
    await markUndelivered(db, { orderId: ulasilamayan, courierId, outcome: 'unreachable' });

    const result = await closeCourierDay(db, { courierId, runId, countedCashCents: 2000 });

    // Durak zaten `ready` (kuryenin hükmü) — kapanış onu "çözmez", yalnız fotoğrafta sayar.
    expect(result).toMatchObject({ ok: true, deliveredCount: 1, pendingCount: 1, releasedCount: 0 });
  });

  it('kapanmış sefer İKİNCİ kez kapatılamaz — kayıt ezilmez', async () => {
    const a = await atTheDoor(2);
    const runId = await depart();
    await collect(a.orderId, a.qty, 'cash');
    const first = await closeCourierDay(db, { courierId, runId, countedCashCents: 2000 });

    const second = await closeCourierDay(db, { courierId, runId, countedCashCents: 99900 });

    expect(second).toMatchObject({ ok: false, reason: 'already_closed', id: first.id });
    const draft = await openDayClose(db, { courierId, runId });
    expect(draft.closed?.countedCashCents).toBe(2000); // ilk sayım yerinde
  });

  it('başkasının seferi bu kapıdan kapatılamaz — "yok" ile "senin değil" aynı cevap', async () => {
    const a = await atTheDoor(2);
    const runId = await depart();
    await collect(a.orderId, a.qty, 'cash');
    const digerKurye = await new UserProfileService(db).insert({ name: 'Kurye Yabancı', email: `yabanci-${stamp}-${dayCounter}@example.test` });
    createdProfiles.push(digerKurye.id);

    const result = await closeCourierDay(db, { courierId: digerKurye.id, runId, countedCashCents: 2000 });

    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('kapanış sonrası hareket düzeltilse bile BEKLENEN donmuş kalır', async () => {
    const a = await atTheDoor(3); // beklenen 30 €
    const runId = await depart();
    await collect(a.orderId, a.qty, 'cash');
    await closeCourierDay(db, { courierId, runId, countedCashCents: 3000 });

    // Ertesi gün biri hareketi düzeltiyor — o gün ne konuşulduğu değişmemeli.
    await db.from('money_movement').delete().eq('order_id', a.orderId);

    const draft = await openDayClose(db, { courierId, runId });
    expect(draft.closed?.expectedCashCents).toBe(3000);
    expect(draft.expected.cashCents).toBe(0); // canlı türetim değişti, kapanış kaydı değişmedi
  });
});
