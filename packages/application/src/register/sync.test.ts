import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  AccountService,
  CategoryService,
  MoneyMovementService,
  OrderItemService,
  OrderService,
  PriceService,
  ProductService,
  RegisterCashOpService,
  RegisterPaymentService,
  RegisterStoreService,
  RegisterTicketService,
  SettingsService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, mustDelete, purgeTestData } from '@lezzet/database/testing';
import { parisDateOf, previousDay } from '@lezzet/helper';
import type { PaymentMethod, RegisterQueue } from '@lezzet/types';
import { closeRegisterDay } from './day-end';
import { memoryRegister } from './memory-register.testkit';
import { REGISTER_LIVE_FROM_KEY, processQueueRow, registerLiveFrom, requeueRegisterStore, setRegisterLiveFrom } from './sync';

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
const ownTestRegisters: { warehouseIds: string[]; accountIds: string[] } = { warehouseIds: [], accountIds: [] };
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
    accountIds: [cashAccountId, bankAccountId, ...ownTestRegisters.accountIds],
    warehouseIds: [warehouseId, unmappedWarehouseId, ...ownTestRegisters.warehouseIds],
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
    .filter((till) => till.label.includes(`#${movementId.slice(0, 8)}`))
    .map(({ direction, amountCents, label }) => ({ direction, amountCents, label }));

let ownStoreCounter = 0;
/** Kendi deposu, çekmecesi ve mağaza eşlemesi olan kasa; yazımları ve gün sonu dosyanın öteki mağazasıyla karışmasın. */
async function ownStore(label: string) {
  const warehouse = (await createTestWarehouse(db, { label })).id;
  const cashAccount = (await new AccountService(db).insert({ name: `${label} çekmecesi ${stamp}`, type: 'cash' })).id;
  ownTestRegisters.warehouseIds.push(warehouse);
  ownTestRegisters.accountIds.push(cashAccount);
  ownStoreCounter += 1;
  const storeId = Number(String(stamp).slice(-9)) + ownStoreCounter;
  await new RegisterStoreService(db).save({ warehouseId: warehouse, externalStoreId: storeId, cashAccountId: cashAccount });
  return { warehouseId: warehouse, cashAccountId: cashAccount, storeId };
}

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

  it('başka siparişe taşınan tahsilat ilk siparişin fişinde ters çevrilir, yenisine yazılır', async () => {
    const first = await newOrder();
    const second = await newOrder();
    await pay(first.id, 2990);
    await runRow('order_id', first.id);
    const [movement] = await movements.listByOrder(first.id);
    await movements.update({ id: movement!.id, orderId: second.id });

    expect(await runRow('order_id', first.id)).toBe('written');
    expect(await runRow('order_id', second.id)).toBe('written');
    expect(salesOf(first.referenceNo)[0]!.payments.map((payment) => payment.amountCents)).toEqual([2990, -2990]);
    expect(salesOf(second.referenceNo)[0]!.payments.map((payment) => payment.amountCents)).toEqual([2990]);
  });

  it('günü kapanmış fişe gelen ödeme nakit akışıdır; cevabı kaybolursa satıştan bulunur, ikinci kez yazılmaz', async () => {
    const own = await ownStore('KASA-KAPALI-GUN');
    const order = await newOrder({ warehouseId: own.warehouseId });
    await pay(order.id, 2000);
    await runRow('order_id', order.id);
    await fake.register.closeDay(own.storeId, parisDateOf(new Date()));
    await pay(order.id, 990);
    fake.failOn('addPayment', 'after');

    expect(await runRow('order_id', order.id)).toBe('failed');
    expect(await runRow('order_id', order.id)).toBe('written');
    const [sale] = salesOf(order.referenceNo);
    expect(sale!.cashFlows.map(({ method, amountCents }) => ({ method, amountCents }))).toEqual([{ method: 'cash', amountCents: 990 }]);
    const rows = await new RegisterPaymentService(db).listByTickets((await tickets.listByOrder(order.id)).map((ticket) => ticket.id));
    expect(rows.find((row) => row.amountCents === 990)).toMatchObject({
      status: 'written',
      externalPaymentId: null,
      externalCashFlowId: sale!.cashFlows[0]!.cashFlowId,
    });
  });

  it('borç doğurmayan kalem iadesi kuyruğa düşer ve kasaya ödemesiz fişle gider', async () => {
    // Kapıda eksik ödenmiş siparişte iade borcu doğmaz, para hareketi de; fiş açılmasaydı kasa gitmeyen malı satılmış gösterirdi.
    const order = await newOrder();
    await orders.update({ id: order.id, status: 'delivered' });
    const items = new OrderItemService(db);
    const [line] = await items.listByOrder(order.id);
    await items.setFulfilled(line!.id, 2);
    await pay(order.id, 2000);
    await runRow('order_id', order.id);

    await items.setFulfilled(line!.id, 1);

    expect(await runRow('order_id', order.id)).toBe('written');
    const [, refund] = salesOf(order.referenceNo);
    expect(refund!.payments).toEqual([]);
    expect(refund!.lines.reduce((sum, saleLine) => sum + saleLine.quantity * saleLine.unitPriceCents, 0)).toBe(-1250);
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

  it('canlıya geçişten önce para görmüş sipariş kasaya yazılmaz', async () => {
    const order = await newOrder();
    await pay(order.id, 2990);

    expect(await runRow('order_id', order.id, new Date(Date.now() + 86_400_000).toISOString())).toBe('skipped');
    expect(salesOf(order.referenceNo)).toHaveLength(0);
  });

  it('canlıya geçişten önce açılıp sonra ödenen sipariş kasaya yazılır', async () => {
    const order = await newOrder();
    const opened = (await orders.getWithItems(order.id))!.order;
    await pay(order.id, 2990);

    expect(await runRow('order_id', order.id, new Date(Date.parse(opened.createdAt) + 1).toISOString())).toBe('written');
    expect(salesOf(order.referenceNo)).toHaveLength(1);
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

describe('kasaya yazılamayan kayıt bildirimi', () => {
  const stuckOf = async (filter: { orderId?: string; dedupeKey?: string }) => {
    let query = db.from('notification').select('id, profile_id, target_id, payload').eq('kind', 'register_write_stuck');
    if (filter.orderId) query = query.eq('target_id', filter.orderId);
    if (filter.dedupeKey) query = query.eq('dedupe_key', filter.dedupeKey);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  };

  it('plan durunca ilk turda yönetime ve muhasebeye haber gider, aynı sebeple yeniden denemede tekrar etmez', async () => {
    const order = await newOrder();
    await pay(order.id, 2990, null);

    expect(await runRow('order_id', order.id)).toBe('blocked');
    const first = await stuckOf({ orderId: order.id });
    expect(first.length).toBeGreaterThan(0);
    expect(first[0]!.payload).toMatchObject({ reason: 'unknown_method', referenceNo: order.referenceNo });

    expect(await runRow('order_id', order.id)).toBe('blocked');
    expect(await stuckOf({ orderId: order.id })).toHaveLength(first.length);
  });

  it('eşlemesiz depoda duran siparişler depo ve gün başına tek haberde toplanır', async () => {
    const unmapped = (await createTestWarehouse(db, { label: 'KASASIZ-HABER' })).id;
    ownTestRegisters.warehouseIds.push(unmapped);
    const first = await newOrder({ warehouseId: unmapped });
    const second = await newOrder({ warehouseId: unmapped });
    await pay(first.id, 2990);
    await pay(second.id, 2990);

    expect(await runRow('order_id', first.id)).toBe('blocked');
    expect(await runRow('order_id', second.id)).toBe('blocked');

    const sent = await stuckOf({ dedupeKey: `register-stuck:no_store:${unmapped}:${parisDateOf(new Date())}` });
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((row) => row.target_id === first.id)).toBe(true);
    expect(await stuckOf({ orderId: second.id })).toHaveLength(0);
  });

  it('hata alan kayıt ilk denemelerde değil beşinci denemede bildirilir', async () => {
    const order = await newOrder();
    await pay(order.id, 2990);

    fake.failOn('closeSale');
    expect(await runRow('order_id', order.id)).toBe('failed');
    expect(await stuckOf({ orderId: order.id })).toHaveLength(0);

    await db.from('register_queue').update({ attempts: 4 }).eq('order_id', order.id);
    fake.failOn('closeSale');
    expect(await runRow('order_id', order.id)).toBe('failed');
    const sent = await stuckOf({ orderId: order.id });
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0]!.payload).toMatchObject({ reason: 'error', referenceNo: order.referenceNo });
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

  it('tutarı değişen kasa hareketinin eski kaydı ters çevrilir, yenisi ayrı açıklamayla yazılır', async () => {
    // Kasadaki kayıt değişmez; değişiklik beklemede kalsaydı kasa sayımı eski tutarla kalırdı.
    const change = await movements.insert({
      accountId: cashAccountId,
      direction: 'in',
      amountCents: 2000,
      type: 'capital',
      description: 'Sermaye',
    });
    expect(await runRow('movement_id', change.id)).toBe('written');
    await movements.update({ id: change.id, amountCents: 2500 });

    expect(await runRow('movement_id', change.id)).toBe('written');
    const ref = `#${change.id.slice(0, 8)}`;
    expect(tillsOf(change.id)).toEqual([
      { direction: 'in', amountCents: 2000, label: `Sermaye ${ref}` },
      { direction: 'out', amountCents: 2000, label: `Annulation Sermaye ${ref}` },
      { direction: 'in', amountCents: 2500, label: `Sermaye ${ref}/2` },
    ]);
  });

  it('çekmece hesabına kartla yazılmış sipariş dışı para kasaya nakit olarak yazılmaz', async () => {
    // Kapı önü satışın kart tahsilatı çekmecenin hesabına düşebilir; nakit girişi yazılsaydı kasa sayımı kart parası kadar şişerdi.
    const card = await movements.insert({
      accountId: cashAccountId,
      direction: 'in',
      amountCents: 500,
      type: 'order_payment',
      paymentMethod: 'card',
      description: 'Kapı önü satış',
    });

    expect(await runRow('movement_id', card.id)).toBe('skipped');
    expect(tillsOf(card.id)).toEqual([]);
  });

  it('ekstre satırı yatırmanın öteki yakasına bağlanınca kasaya ikinci çıkış yazılmaz', async () => {
    const deposit = await movements.insert({
      accountId: cashAccountId,
      direction: 'out',
      amountCents: 6000,
      type: 'transfer',
      counterAccountId: bankAccountId,
      description: 'Kasa fazlası bankaya',
    });
    expect(await runRow('movement_id', deposit.id)).toBe('written');
    const line = await movements.insert({
      accountId: bankAccountId,
      direction: 'in',
      amountCents: 6000,
      type: 'misc',
      source: 'bank_import',
      description: 'VERSEMENT ESPECES',
    });
    await movements.update({
      id: line.id,
      type: 'transfer',
      counterAccountId: cashAccountId,
      counterpartMovementId: deposit.id,
      reconciled: true,
    });

    expect(await runRow('movement_id', line.id)).toBe('skipped');
    expect(tillsOf(line.id)).toEqual([]);
    expect(tillsOf(deposit.id)).toHaveLength(1);
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

  it('ay dönümü gecesi cevabı kaybolan kasa hareketi Paris ayında bulunur, ikinci kez yazılmaz', async () => {
    // Paris'te 1 Kasım 00:30, UTC'de hâlâ 31 Ekim.
    const night = new Date('2026-10-31T23:30:00.000Z');
    const nightly = memoryRegister({ now: () => night });
    const own = await ownStore('KASA-GECE');
    const change = await movements.insert({
      accountId: own.cashAccountId,
      direction: 'in',
      amountCents: 1500,
      type: 'capital',
      description: 'Gece bozukluğu',
    });
    const row = (await queueRowOf('movement_id', change.id))!;
    nightly.failOn('moveCash', 'after');

    expect(await processQueueRow(db, nightly.register, row, { liveFrom: LIVE_FROM, now: night })).toBe('failed');
    expect(await processQueueRow(db, nightly.register, row, { liveFrom: LIVE_FROM, now: night })).toBe('written');
    expect(nightly.tills.filter((till) => till.label.endsWith(`#${change.id.slice(0, 8)}`))).toHaveLength(1);
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

describe('eşleme', () => {
  it('eşlemeden önce yazılmış çekmece hareketi kuyruğa alınır, eşlemesi olmadığı için duran sipariş hemen yeniden denenir', async () => {
    // Tetikleyici yalnız yazım anında eşlenmiş çekmeceyi görür; eşleme sonradan kurulunca aradaki nakit kasaya hiç gitmezdi.
    const warehouse = (await createTestWarehouse(db, { label: 'KASA-SONRADAN' })).id;
    const cash = (await new AccountService(db).insert({ name: `Sonradan eşlenen çekmece ${stamp}`, type: 'cash' })).id;
    ownTestRegisters.warehouseIds.push(warehouse);
    ownTestRegisters.accountIds.push(cash);
    const expense = await movements.insert({
      accountId: cash,
      direction: 'out',
      amountCents: 700,
      type: 'expense',
      description: 'Eşlemeden önce',
    });
    const order = await newOrder({ warehouseId: warehouse });
    await pay(order.id, 2990);
    expect(await runRow('order_id', order.id)).toBe('blocked');
    expect(await queueRowOf('movement_id', expense.id)).toBeNull();

    const store = await new RegisterStoreService(db).save({
      warehouseId: warehouse,
      externalStoreId: Number(String(stamp).slice(-9)) + 50,
      cashAccountId: cash,
    });
    await requeueRegisterStore(db, store, LIVE_FROM);

    expect(Date.parse((await queueRowOf('order_id', order.id))!.nextAttemptAt)).toBeLessThanOrEqual(Date.now());
    expect(await runRow('movement_id', expense.id)).toBe('written');
    expect(tillsOf(expense.id)).toHaveLength(1);
  });
});

describe('gün sonu', () => {
  const today = () => parisDateOf(new Date());
  const daysBefore = (count: number) => Array.from({ length: count }).reduce<string>((day) => previousDay(day), today());

  it('defter, ayna ve kasa tutuyorsa gün kapanır ve ikinci kez kapatılmaz', async () => {
    const own = await ownStore('KASA-KAPANIS');
    const order = await newOrder({ warehouseId: own.warehouseId });
    await pay(order.id, 2990);
    await runRow('order_id', order.id);
    const expense = await movements.insert({
      accountId: own.cashAccountId,
      direction: 'out',
      amountCents: 1000,
      type: 'expense',
      description: 'Kasadan gider',
    });
    await runRow('movement_id', expense.id);
    const closeDay = vi.spyOn(fake.register, 'closeDay');

    const first = await closeRegisterDay(db, fake.register, { date: today(), close: true, liveFromDate: today() });
    const second = await closeRegisterDay(db, fake.register, { date: today(), close: true, liveFromDate: today() });

    expect(first.stores.find((store) => store.warehouseId === own.warehouseId)).toEqual({
      warehouseId: own.warehouseId,
      closed: true,
      days: [{ date: today(), differences: [] }],
      waiting: 0,
      olderUnclosed: false,
    });
    expect(second.stores.find((store) => store.warehouseId === own.warehouseId)).toEqual({
      warehouseId: own.warehouseId,
      closed: true,
      days: [],
      waiting: 0,
      olderUnclosed: false,
    });
    // Paylaşılan veritabanında başka eşlenmiş mağaza da olabilir; sayılan yalnız bu mağaza.
    expect(closeDay.mock.calls.filter(([id]) => id === own.storeId)).toHaveLength(1);
    closeDay.mockRestore();
  });

  it('defterin saymadığı kasa kaydı fark çıkarır ve gün kapanmaz', async () => {
    // Bağlı ekstre satırına plan kasa kaydı yazsaydı (çift çıkış) ayna ile kasa yine tutardı; farkı ancak defter gösterir.
    const own = await ownStore('KASA-DEFTER');
    const deposit = await movements.insert({
      accountId: own.cashAccountId,
      direction: 'out',
      amountCents: 6000,
      type: 'transfer',
      counterAccountId: bankAccountId,
      description: 'Bankaya yatırma',
    });
    await runRow('movement_id', deposit.id);
    const line = await movements.insert({
      accountId: bankAccountId,
      direction: 'in',
      amountCents: 6000,
      type: 'misc',
      source: 'bank_import',
      description: 'VERSEMENT',
    });
    await movements.update({
      id: line.id,
      type: 'transfer',
      counterAccountId: own.cashAccountId,
      counterpartMovementId: deposit.id,
      reconciled: true,
    });
    await runRow('movement_id', line.id);
    const ops = new RegisterCashOpService(db);
    const wrong = await ops.insert({
      warehouseId: own.warehouseId,
      movementId: line.id,
      reversalOf: null,
      direction: 'out',
      amountCents: 6000,
      label: 'çift çıkış',
    });
    await ops.update({ id: wrong.id, status: 'written', writtenAt: new Date().toISOString() });
    await fake.register.moveCash({ storeId: own.storeId, direction: 'out', amountCents: 6000, label: 'çift çıkış' });

    const result = await closeRegisterDay(db, fake.register, { date: today(), close: true, liveFromDate: today() });

    const store = result.stores.find((candidate) => candidate.warehouseId === own.warehouseId)!;
    expect(store.closed).toBe(false);
    expect(store.days[0]!.differences).toEqual([
      { kind: 'ledger', movementId: line.id, entry: 'cash', method: null, expectedCents: 0, writtenCents: -6000 },
    ]);
  });

  it('mağazanın kuyruğunda bekleyen kayıt varsa defter, ayna ve kasa tutsa da gün kapanmaz', async () => {
    // Kalem değişikliği kuyruğa düştü ama henüz yazılmadı: kasa bugünkü satışı eksik gösteriyor, kapanış onu dondururdu.
    const own = await ownStore('KASA-BEKLEYEN');
    const order = await newOrder({ warehouseId: own.warehouseId });
    await orders.update({ id: order.id, status: 'delivered' });
    const items = new OrderItemService(db);
    const [line] = await items.listByOrder(order.id);
    await items.setFulfilled(line!.id, 2);
    await pay(order.id, 2000);
    await runRow('order_id', order.id);
    await items.setFulfilled(line!.id, 1);

    const result = await closeRegisterDay(db, fake.register, { date: today(), close: true, liveFromDate: today() });

    expect(result.stores.find((store) => store.warehouseId === own.warehouseId)).toEqual({
      warehouseId: own.warehouseId,
      closed: false,
      days: [{ date: today(), differences: [] }],
      waiting: 1,
      olderUnclosed: false,
    });
  });

  it('ödemesiz fiş satış listesinde fark sayılmaz, gün kapanır', async () => {
    // Kasanın satış listesi günün ödemelerinden okunur; ödemesiz fiş orada yoktur, bizde sayılsaydı her iade günü kapanışı bekletirdi.
    const own = await ownStore('KASA-ODEMESIZ');
    const order = await newOrder({ warehouseId: own.warehouseId });
    await orders.update({ id: order.id, status: 'delivered' });
    const items = new OrderItemService(db);
    const [line] = await items.listByOrder(order.id);
    await items.setFulfilled(line!.id, 2);
    await pay(order.id, 2000);
    await runRow('order_id', order.id);
    await items.setFulfilled(line!.id, 1);
    await runRow('order_id', order.id);

    const result = await closeRegisterDay(db, fake.register, { date: today(), close: true, liveFromDate: today() });

    expect(result.stores.find((store) => store.warehouseId === own.warehouseId)).toMatchObject({
      closed: true,
      days: [{ date: today(), differences: [] }],
    });
  });

  it('arama sınırının gerisinde kapanmamış gün varsa gün kapatılmaz, çünkü kapanış onu da karşılaştırmadan mühürlerdi', async () => {
    const own = await ownStore('KASA-ESKI-GUN');
    const closeDay = vi.spyOn(fake.register, 'closeDay');
    const liveFromDate = daysBefore(10);

    const result = await closeRegisterDay(db, fake.register, { date: today(), close: true, liveFromDate });

    const store = result.stores.find((candidate) => candidate.warehouseId === own.warehouseId)!;
    expect(store).toMatchObject({ closed: false, olderUnclosed: true });
    expect(store.days).toHaveLength(7);
    expect(store.days.every((day) => day.differences.length === 0)).toBe(true);
    expect(closeDay.mock.calls.filter(([id]) => id === own.storeId)).toHaveLength(0);
    closeDay.mockRestore();
  });

  it('canlıya geçiş günü arama sınırının içindeyse daha eski gün aranmaz, gün kapanır', async () => {
    const own = await ownStore('KASA-SINIR');
    const liveFromDate = daysBefore(6);

    const result = await closeRegisterDay(db, fake.register, { date: today(), close: true, liveFromDate });

    expect(result.stores.find((candidate) => candidate.warehouseId === own.warehouseId)).toMatchObject({
      closed: true,
      olderUnclosed: false,
    });
  });

  it('canlı kasa değilse gün kapatılmaz, mutabakat yine koşar', async () => {
    const closeDay = vi.spyOn(fake.register, 'closeDay');
    const date = '2026-01-01';

    const result = await closeRegisterDay(db, fake.register, { date, close: false, liveFromDate: date });

    expect(closeDay).not.toHaveBeenCalled();
    expect(result.stores.find((store) => store.warehouseId === warehouseId)).toMatchObject({
      closed: false,
      days: [{ date, differences: [] }],
    });
    closeDay.mockRestore();
  });

  it('kasa ekranından elle yapılan satış fark sayılır', async () => {
    const own = await ownStore('KASA-ELLE');
    const productId = [...fake.products.keys()][0]!;
    const manual = await fake.register.createSale(own.storeId);
    await fake.register.prepareSale(manual, 'ELLE');
    await fake.register.addLine({ saleId: manual, productId, quantity: 1, unitPriceCents: 500, vatRate: 20 });
    await fake.register.addPayment({ saleId: manual, method: 'cash', amountCents: 500 });
    await fake.register.closeSale(manual);

    const result = await closeRegisterDay(db, fake.register, { date: today(), close: false, liveFromDate: today() });

    const kinds = result.stores.find((store) => store.warehouseId === own.warehouseId)!.days[0]!.differences;
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
