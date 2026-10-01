import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  AccountService,
  CategoryService,
  MoneyMovementService,
  OrderService,
  PriceService,
  ProductService,
  RegisterStoreService,
  RegisterTicketService,
  SettingsService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, mustDelete, purgeTestData } from '@lezzet/database/testing';
import { parisDateOf } from '@lezzet/helper';
import type { PaymentMethod, RegisterQueue } from '@lezzet/types';
import { closeRegisterDay } from './day-end';
import { memoryRegister } from './memory-register.testkit';
import { REGISTER_LIVE_FROM_KEY, processQueueRow, registerLiveFrom, setRegisterLiveFrom } from './sync';

/**
 * Kasa eşitlemesi kuyruk satırından kasaya: fiş, ödeme satırı ve fiş dışı nakit doğru yazılır, yarıda kalan yazım kasadaki hâlinden
 * tamamlanır ve hiçbir şey iki kez yazılmaz. Testler yalnız kendi siparişlerinin satırını işler, paylaşılan kuyruğa dokunmaz.
 */
const db = serviceDb();
const orders = new OrderService(db);
const movements = new MoneyMovementService(db);
const tickets = new RegisterTicketService(db);

const stamp = Date.now();
const LIVE_FROM = '2000-01-01T00:00:00.000Z';
/** Gerçek kasa gibi dosya boyunca tek kasa: ürün aynası kalıcıdır ve kasadaki ürün numaralarını anar. */
const fake = memoryRegister();
let warehouseId: string;
let unmappedWarehouseId: string;
let customerId: string;
let categoryId: string;
let productId: string;
let variantId: string;
let cashAccountId: string;
let bankAccountId: string;
let shippingBefore: string[] = [];
let orderCounter = 0;

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'KASA' })).id;
  unmappedWarehouseId = (await createTestWarehouse(db, { label: 'KASASIZ' })).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Kasa eşitleme ${stamp}` } })).id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Lokum ${stamp}`, fr: `Loukoum ${stamp}` },
    categoryId,
    variants: [{ label: { tr: '250 g', fr: '250 g' } }],
  });
  productId = product.id;
  variantId = variants[0]!.id;
  await new PriceService(db).setPrice({ variantId, channel: 'b2c', amountCents: 1300 });
  customerId = (await new UserProfileService(db).insert({ name: `Kasa müşterisi ${stamp}` })).id;
  const accounts = new AccountService(db);
  cashAccountId = (await accounts.insert({ name: `Kasa eşitleme çekmecesi ${stamp}`, type: 'cash' })).id;
  bankAccountId = (await accounts.insert({ name: `Kasa eşitleme bankası ${stamp}`, type: 'bank' })).id;
  await new RegisterStoreService(db).save({ warehouseId, externalStoreId: Number(String(stamp).slice(-9)), cashAccountId });

  // Kargo ürünü oran başına küreseldir: önceden açılmışsa sahte kasa onu tanır, testin açtığı ise sonunda silinir.
  const { data, error } = await db.from('register_product').select('id, external_product_id, name, vat_rate').eq('kind', 'shipping');
  if (error) throw error;
  shippingBefore = (data ?? []).map((row) => row.id as string);
  for (const row of data ?? []) {
    fake.knowProduct(row.external_product_id as number, {
      name: row.name as string,
      priceCents: 0,
      vatRate: Number(row.vat_rate),
      refExt: '',
    });
  }
});

afterAll(async () => {
  await mustDelete(db, 'register_product', (q) =>
    shippingBefore.length > 0 ? q.eq('kind', 'shipping').not('id', 'in', `(${shippingBefore.join(',')})`) : q.eq('kind', 'shipping'),
  );
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: [customerId],
    accountIds: [cashAccountId, bankAccountId],
    warehouseIds: [warehouseId, unmappedWarehouseId],
  });
});

/** 2 × 12,50 € + 4,90 € kargo = 29,90 €; hazırlık kesinleşmediği için ücretlenen sipariş edilendir. */
async function newOrder(over: { channel?: 'b2c' | 'b2b'; warehouseId?: string; vatRate?: number } = {}) {
  const { order } = await orders.create(
    {
      warehouseId: over.warehouseId ?? warehouseId,
      customerId,
      channel: over.channel ?? 'b2c',
      status: 'confirmed',
      shippingFeeCents: 490,
      orderedTotalCents: 2990,
    },
    [{ variantId, qty: 2, unitPriceCents: 1250, vatRate: over.vatRate ?? 5.5 }],
  );
  const referenceNo = `LA-T${stamp}-${++orderCounter}`;
  await orders.update({ id: order.id, referenceNo });
  return { id: order.id, referenceNo };
}

const pay = (
  orderId: string,
  amountCents: number,
  method: PaymentMethod | null = 'cash',
  type: 'order_payment' | 'order_refund' = 'order_payment',
) => movements.recordForOrder({ orderId, accountId: cashAccountId, amountCents, type, paymentMethod: method });

async function queueRowOf(column: 'order_id' | 'movement_id', id: string): Promise<RegisterQueue | null> {
  const { data, error } = await db
    .from('register_queue')
    .select('id, order_id, movement_id, marked_at, attempts, next_attempt_at, last_error')
    .eq(column, id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    orderId: data.order_id,
    movementId: data.movement_id,
    markedAt: data.marked_at,
    attempts: data.attempts,
    nextAttemptAt: data.next_attempt_at,
    lastError: data.last_error,
  };
}

async function runRow(column: 'order_id' | 'movement_id', id: string, liveFrom = LIVE_FROM) {
  const row = await queueRowOf(column, id);
  if (!row) throw new Error(`kuyruk satırı yok (${column} ${id})`);
  return processQueueRow(db, fake.register, row, { liveFrom, now: new Date() });
}

/** İşlenmiş satırı yeniden işlemek, tekrar eden turun ya da kuyruğa yeniden düşen aynı işin karşılığıdır. */
const runAgain = (row: RegisterQueue) => processQueueRow(db, fake.register, row, { liveFrom: LIVE_FROM, now: new Date() });

const salesOf = (referenceNo: string) =>
  [...fake.sales].filter(([, sale]) => sale.extRef.startsWith(`${referenceNo}-`)).map(([saleId, sale]) => ({ saleId, ...sale }));

const tillsOf = (movementId: string) =>
  fake.tills
    .filter((till) => till.label.endsWith(`#${movementId.slice(0, 8)}`))
    .map(({ direction, amountCents, label }) => ({ direction, amountCents, label }));

describe('sipariş fişi', () => {
  it('ilk tahsilat fişi açar ve kapatır: kalemler, kargo payı ve ödeme; ayna yazıldı, kuyruk satırı tamamlandı', async () => {
    const order = await newOrder();
    await pay(order.id, 2990);

    expect(await runRow('order_id', order.id)).toBe('written');

    const [sale, ...others] = salesOf(order.referenceNo);
    expect(others).toHaveLength(0);
    expect(sale).toMatchObject({ extRef: `${order.referenceNo}-1`, divided: true });
    expect(sale!.closedAt).not.toBeNull();
    expect(sale!.lines.map(({ quantity, unitPriceCents, vatRate }) => ({ quantity, unitPriceCents, vatRate }))).toEqual([
      { quantity: 2, unitPriceCents: 1250, vatRate: 5.5 },
      { quantity: 1, unitPriceCents: 490, vatRate: 5.5 },
    ]);
    expect(sale!.payments.map(({ method, amountCents }) => ({ method, amountCents }))).toEqual([{ method: 'cash', amountCents: 2990 }]);
    // Kasa ürünü katalogdan açılır: Fransızca ad ve boy, B2C liste fiyatı; kargo oran başına ayrı üründür.
    const productOf = (productId: number) => fake.products.get(productId)!;
    expect(
      sale!.lines.map((line) => productOf(line.productId)).map(({ name, priceCents, vatRate }) => ({ name, priceCents, vatRate })),
    ).toEqual([
      { name: `Loukoum ${stamp} (250 g)`, priceCents: 1300, vatRate: 5.5 },
      { name: 'Frais de livraison 5,5 %', priceCents: 0, vatRate: 5.5 },
    ]);
    expect(await tickets.listByOrder(order.id)).toMatchObject([
      { seq: 1, status: 'written', externalSaleId: sale!.saleId, receiptUrl: `https://fis.test/${sale!.saleId}` },
    ]);
    expect(await queueRowOf('order_id', order.id)).toBeNull();
  });

  it('ikinci tahsilat yeni fiş açmaz, son fişe ödeme satırı ekler; tur tekrarlanınca kasaya ikinci kez yazılmaz', async () => {
    const order = await newOrder();
    await pay(order.id, 1000);
    await runRow('order_id', order.id);
    await pay(order.id, 1990, 'card');
    const row = (await queueRowOf('order_id', order.id))!;
    await runAgain(row);

    expect(await runAgain(row)).toBe('written');

    const sales = salesOf(order.referenceNo);
    expect(sales).toHaveLength(1);
    expect(sales[0]!.payments.map(({ method, amountCents }) => ({ method, amountCents }))).toEqual([
      { method: 'cash', amountCents: 1000 },
      { method: 'card', amountCents: 1990 },
    ]);
  });

  it('iki tahsilat aynı turda gelirse fiş tek kez açılır ve ikinci ödeme ona eklenir', async () => {
    const order = await newOrder();
    await pay(order.id, 2000);
    await pay(order.id, 990, 'card');

    expect(await runRow('order_id', order.id)).toBe('written');
    const sales = salesOf(order.referenceNo);
    expect(sales).toHaveLength(1);
    expect(sales[0]!.payments.map(({ method, amountCents }) => ({ method, amountCents }))).toEqual([
      { method: 'cash', amountCents: 2000 },
      { method: 'card', amountCents: 990 },
    ]);
  });

  it('kalemin KDV oranı ürününkinden farklıysa (oran sonradan değişmiş) kalem kendi oranıyla yazılır', async () => {
    const order = await newOrder({ vatRate: 10 });
    await pay(order.id, 2990);

    await runRow('order_id', order.id);
    expect(salesOf(order.referenceNo)[0]!.lines.map((line) => line.vatRate)).toEqual([10, 10]);
  });

  it('kapanmadan kesilen fiş sonraki turda aynı satışta tamamlanır; kalem ve ödeme iki kez yazılmaz', async () => {
    const order = await newOrder();
    await pay(order.id, 2990);
    fake.failOn('closeSale');

    expect(await runRow('order_id', order.id)).toBe('failed');
    expect(await queueRowOf('order_id', order.id)).toMatchObject({ attempts: 1, lastError: 'kasa yanıt vermedi (closeSale)' });
    expect(await tickets.listByOrder(order.id)).toMatchObject([{ status: 'writing' }]);

    expect(await runRow('order_id', order.id)).toBe('written');
    const sales = salesOf(order.referenceNo);
    expect(sales).toHaveLength(1);
    expect(sales[0]!.closedAt).not.toBeNull();
    expect(sales[0]!.lines).toHaveLength(2);
    expect(sales[0]!.payments).toHaveLength(1);
  });

  it('satış numarası aynadan kaybolduysa satış `ext_ref` ile bulunur, ikinci satış açılmaz', async () => {
    const order = await newOrder();
    await pay(order.id, 2990);
    fake.failOn('addLine');
    await runRow('order_id', order.id);
    const [ticket] = await tickets.listByOrder(order.id);
    await tickets.update({ id: ticket!.id, externalSaleId: null });

    expect(await runRow('order_id', order.id)).toBe('written');
    expect(salesOf(order.referenceNo)).toHaveLength(1);
  });

  it('kapanmış fişe eklenen ödemenin cevabı kaybolursa kasadaki sahipsiz satır sahiplenilir, ödeme ikinci kez yazılmaz', async () => {
    const order = await newOrder();
    await pay(order.id, 1000);
    await runRow('order_id', order.id);
    await pay(order.id, 1990);
    fake.failOn('addPayment', 'after');

    expect(await runRow('order_id', order.id)).toBe('failed');
    expect(await runRow('order_id', order.id)).toBe('written');
    expect(salesOf(order.referenceNo)[0]!.payments.map((payment) => payment.amountCents)).toEqual([1000, 1990]);
  });

  it('iptal edilen siparişin iadesi eksi kalemli yeni fiş açar; iade ödemesi eksidir', async () => {
    const order = await newOrder();
    await pay(order.id, 2990);
    await runRow('order_id', order.id);
    await orders.update({ id: order.id, status: 'cancelled' });
    await pay(order.id, 2990, 'cash', 'order_refund');

    expect(await runRow('order_id', order.id)).toBe('written');
    const refund = salesOf(order.referenceNo).find((sale) => sale.extRef === `${order.referenceNo}-2`);
    expect(refund!.lines.map(({ quantity, unitPriceCents }) => ({ quantity, unitPriceCents }))).toEqual([
      { quantity: 2, unitPriceCents: -1250 },
      { quantity: 1, unitPriceCents: -490 },
    ]);
    expect(refund!.payments.map(({ method, amountCents }) => ({ method, amountCents }))).toEqual([{ method: 'cash', amountCents: -2990 }]);
  });
});

describe('yazılmayan ve bekleyen', () => {
  it('B2B siparişi kasaya yazılmaz, kuyruk satırı tamamlanır', async () => {
    const order = await newOrder({ channel: 'b2b' });
    await pay(order.id, 2990, 'bank_transfer');

    expect(await runRow('order_id', order.id)).toBe('skipped');
    expect(salesOf(order.referenceNo)).toHaveLength(0);
    expect(await queueRowOf('order_id', order.id)).toBeNull();
  });

  it('canlıya geçişten önce açılan sipariş kasaya yazılmaz', async () => {
    const order = await newOrder();
    await pay(order.id, 2990);

    expect(await runRow('order_id', order.id, new Date(Date.now() + 86_400_000).toISOString())).toBe('skipped');
    expect(salesOf(order.referenceNo)).toHaveLength(0);
  });

  it('yöntemi bilinmeyen tahsilat tahminle yazılmaz: satır sebebiyle ertelenir', async () => {
    const order = await newOrder();
    await pay(order.id, 2990, null);

    expect(await runRow('order_id', order.id)).toBe('blocked');
    const row = await queueRowOf('order_id', order.id);
    expect(row).toMatchObject({ lastError: 'blocked:unknown_method' });
    expect(Date.parse(row!.nextAttemptAt)).toBeGreaterThan(Date.now());
    expect(salesOf(order.referenceNo)).toHaveLength(0);
  });

  it('kasa mağazası eşlenmemiş depodaki sipariş beklemeye alınır', async () => {
    const order = await newOrder({ warehouseId: unmappedWarehouseId });
    await pay(order.id, 2990);

    expect(await runRow('order_id', order.id)).toBe('blocked');
    expect(await queueRowOf('order_id', order.id)).toMatchObject({ lastError: 'blocked:no_store' });
  });
});

describe('fiş dışı nakit', () => {
  it('kasadan bankaya yatırma kasadan çıkıştır; hareket silinirse kasada bir kez ters çevrilir', async () => {
    const deposit = await movements.insert({
      accountId: cashAccountId,
      direction: 'out',
      amountCents: 5000,
      type: 'transfer',
      counterAccountId: bankAccountId,
      description: 'Bankaya yatırma',
    });

    expect(await runRow('movement_id', deposit.id)).toBe('written');
    await movements.delete(deposit.id);
    const removed = (await queueRowOf('movement_id', deposit.id))!;
    expect(await runAgain(removed)).toBe('written');
    expect(await runAgain(removed)).toBe('written');

    expect(tillsOf(deposit.id)).toEqual([
      { direction: 'out', amountCents: 5000, label: `Bankaya yatırma #${deposit.id.slice(0, 8)}` },
      { direction: 'in', amountCents: 5000, label: `Annulation Bankaya yatırma #${deposit.id.slice(0, 8)}` },
    ]);
  });

  it('kasa hareketinin cevabı kaybolursa açıklamasından bulunur, ikinci kez yazılmaz', async () => {
    const change = await movements.insert({
      accountId: cashAccountId,
      direction: 'in',
      amountCents: 2000,
      type: 'capital',
      description: 'Bozukluk',
    });
    fake.failOn('moveCash', 'after');

    expect(await runRow('movement_id', change.id)).toBe('failed');
    expect(await runRow('movement_id', change.id)).toBe('written');
    expect(tillsOf(change.id)).toHaveLength(1);
  });

  it('B2C nakdi fişle girer, kasa hareketi olmaz; B2B nakdi kasa hareketidir', async () => {
    const b2c = await newOrder();
    const b2b = await newOrder({ channel: 'b2b' });
    await pay(b2c.id, 2990);
    await pay(b2b.id, 2990);
    const [b2cMovement] = await movements.listByOrder(b2c.id);
    const [b2bMovement] = await movements.listByOrder(b2b.id);

    expect(await runRow('movement_id', b2cMovement!.id)).toBe('skipped');
    expect(await runRow('movement_id', b2bMovement!.id)).toBe('written');
    expect(tillsOf(b2cMovement!.id)).toEqual([]);
    expect(tillsOf(b2bMovement!.id).map(({ direction, amountCents }) => ({ direction, amountCents }))).toEqual([
      { direction: 'in', amountCents: 2990 },
    ]);
  });
});

describe('gün sonu', () => {
  it('kasa aynayla aynıysa fark yoktur; gün kapanır ve ikinci kez kapatılmaz', async () => {
    const order = await newOrder();
    await pay(order.id, 2990);
    await runRow('order_id', order.id);
    const deposit = await movements.insert({
      accountId: cashAccountId,
      direction: 'out',
      amountCents: 1000,
      type: 'expense',
      description: 'Kasadan gider',
    });
    await runRow('movement_id', deposit.id);
    const date = parisDateOf(new Date());
    const closeDay = vi.spyOn(fake.register, 'closeDay');

    const first = await closeRegisterDay(db, fake.register, { date, close: true });
    const second = await closeRegisterDay(db, fake.register, { date, close: true });

    expect(first.stores.find((store) => store.warehouseId === warehouseId)).toEqual({ warehouseId, closed: true, differences: [] });
    expect(second.stores.find((store) => store.warehouseId === warehouseId)).toEqual({ warehouseId, closed: true, differences: [] });
    expect(closeDay).toHaveBeenCalledTimes(1);
    closeDay.mockRestore();
  });

  it('canlı kasa değilse gün kapatılmaz, mutabakat yine koşar', async () => {
    const closeDay = vi.spyOn(fake.register, 'closeDay');
    const date = '2026-01-01';

    const result = await closeRegisterDay(db, fake.register, { date, close: false });

    expect(closeDay).not.toHaveBeenCalled();
    expect(result.stores.find((store) => store.warehouseId === warehouseId)).toMatchObject({ closed: false });
    closeDay.mockRestore();
  });

  it('kasa ekranından elle yapılan satış fark sayılır', async () => {
    const storeId = Number(String(stamp).slice(-9));
    const productId = [...fake.products.keys()][0]!;
    const manual = await fake.register.createSale(storeId);
    await fake.register.prepareSale(manual, 'ELLE');
    await fake.register.addLine({ saleId: manual, productId, quantity: 1, unitPriceCents: 500, vatRate: 20 });
    await fake.register.addPayment({ saleId: manual, method: 'cash', amountCents: 500 });
    await fake.register.closeSale(manual);

    const result = await closeRegisterDay(db, fake.register, { date: parisDateOf(new Date()), close: false });

    const kinds = result.stores.find((store) => store.warehouseId === warehouseId)!.differences;
    expect(kinds).toContainEqual({ kind: 'unknown_sale', saleId: manual });
    expect(kinds).toContainEqual({ kind: 'vat', vatRate: 20, oursCents: 0, registerCents: 500 });
  });
});

describe('canlıya geçiş', () => {
  it('kasayı kapatmak ayarı siler: değeri boş yazılamaz, okuma hemen kapalı görür', async () => {
    const settings = new SettingsService(db);
    const before = (await settings.listByKey(REGISTER_LIVE_FROM_KEY))[0]?.value as string | undefined;
    try {
      await setRegisterLiveFrom(db, '2026-09-30T22:00:00.000Z');
      expect(await registerLiveFrom(db)).toBe('2026-09-30T22:00:00.000Z');

      await setRegisterLiveFrom(db, null);

      expect(await registerLiveFrom(db)).toBeNull();
      expect(await settings.listByKey(REGISTER_LIVE_FROM_KEY)).toEqual([]);
    } finally {
      // Küresel satır: testten önceki değer geri konur.
      await setRegisterLiveFrom(db, before ?? null);
    }
  });
});
