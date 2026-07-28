import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CategoryService, OrderService, ProductService, ReservationService, StockService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { confirmPreparation, listPreparationQueue, type PreparationLine, type PreparationOrder } from './preparation';
import { transitionOrder } from './transition';

/**
 * Depo hazırlık kuyruğu ve onayı (10.1–10.3).
 *
 * En kritik doğrulama para DEĞİL, paranın YOKLUĞU: depo ekranına giden veride hiçbir tutar
 * bulunmamalı (tasarım §6 — "fiyat, tutar, kâr, maliyet asla görünmez"). Bunu bir arayüz
 * disiplinine bırakmak yerine veri şeklinde sınıyoruz.
 */
const db = serviceDb();
const orders = new OrderService(db);
const stocks = new StockService(db);
const reservations = new ReservationService(db);

const stamp = Date.now();
let customerId: string;
let variantId: string;
let productId: string;
let categoryId: string;
let nearBatch: string;
let farBatch: string;
const createdProfiles: string[] = [];

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  const category = await new CategoryService(db).create({ name: { tr: `Depo testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Fıstıklı Baklava ${stamp}` },
    categoryId: category.id,
    variants: [{ label: { tr: '500 g' } }],
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  const profile = await new UserProfileService(db).insert({ name: 'Ayşe Yılmaz', email: `depo-${stamp}@example.test` });
  customerId = profile.id;
  createdProfiles.push(profile.id);
});

beforeEach(async () => {
  await db.from('order').delete().eq('customer_id', customerId);
  await db.from('reservation').delete().eq('variant_id', variantId);
  await db.from('stock').delete().eq('variant_id', variantId);
  // Yakın tarihli parti önce çıkmalı (FEFO) — konum da öneriyle birlikte gitmeli.
  nearBatch = (await stocks.insert({ variantId, physicalQty: 4, expiryDate: dayOffset(10), purchasePrice: 4, location: 'Dolap A' })).id;
  farBatch = (await stocks.insert({ variantId, physicalQty: 10, expiryDate: dayOffset(90), purchasePrice: 5, location: 'Dolap B' })).id;
});

afterAll(async () => {
  await db.from('order').delete().eq('customer_id', customerId);
  await db.from('reservation').delete().eq('variant_id', variantId);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: createdProfiles });
});

/** Onaylanmış sipariş — kuyruğa düşmesi için gereken en kısa yol. */
async function confirmedOrder(qty: number, opts: { pinTo?: string; deliveryDate?: string } = {}) {
  const { order, items } = await orders.create(
    { customerId, channel: 'b2c', deliveryType: 'route', deliveryDate: opts.deliveryDate, total: qty * 10 },
    [{ variantId, qty, unitPrice: 10, vatRate: 5.5, stockId: opts.pinTo }],
  );
  await reservations.reserve({ orderId: order.id, variantId, qty, stockId: opts.pinTo });
  await transitionOrder({ orderId: order.id, to: 'confirmed' });
  return { orderId: order.id, itemId: items[0]!.id };
}

describe('hazırlık kuyruğu (10.1)', () => {
  it('kalem başına parti önerisi verir — önce tarihi yakın olan, konumuyla', async () => {
    const { orderId } = await confirmedOrder(6);

    // Kuyrukta seed'den gelen başka siparişler de olabilir; kendi satırımızı kimlikle buluyoruz.
    const line: PreparationLine = (await listPreparationQueue()).find((row) => row.orderId === orderId)!.lines[0]!;

    // 4 adet yakın partiden, kalan 2 uzak partiden — bir kalem birden çok partiye bölünebilir.
    expect(line.suggestion).toEqual([
      { stockId: nearBatch, qty: 4, expiryDate: dayOffset(10), location: 'Dolap A' },
      { stockId: farBatch, qty: 2, expiryDate: dayOffset(90), location: 'Dolap B' },
    ]);
    expect(line.productName).toContain('Fıstıklı Baklava');
    expect(line.variantLabel).toBe('500 g');
    expect(line.shortfallQty).toBe(0);
  });

  it('depoya giden veride HİÇBİR tutar yok (tasarım §6)', async () => {
    const { orderId } = await confirmedOrder(2);

    const mine: PreparationOrder = (await listPreparationQueue()).find((row) => row.orderId === orderId)!;

    const serialized = JSON.stringify(mine);
    for (const moneyKey of ['unitPrice', 'total', 'purchasePrice', 'lineDiscountAmount', 'amountCollected', 'vatRate']) {
      expect(serialized).not.toContain(moneyKey);
    }
    // Adres ve iletişim de yok; yalnız koli etiketi için ad var.
    expect(serialized).not.toContain('@example.test');
    expect(mine.customerName).toBe('Ayşe Yılmaz');
  });

  it('yarım kalan hazırlık kuyrukta KALIR ve ilerlemesi görünür', async () => {
    const { orderId, itemId } = await confirmedOrder(5);
    await transitionOrder({ orderId, to: 'preparing' });
    await orders.recordPreparation(orderId, [{ orderItemId: itemId, batches: [{ stockId: nearBatch, qty: 2 }] }]);

    const queue = await listPreparationQueue();
    const order = queue.find((row) => row.orderId === orderId)!;

    expect(order.status).toBe('preparing');
    expect(order.pickedLineCount).toBe(0); // kalem tamamlanmadı
    expect(order.lines[0]!.pickedQty).toBe(2);
    // Öneri KALAN adet için kurulur — toplanan tekrar toplanmaz.
    expect(order.lines[0]!.suggestion.reduce((sum, pick) => sum + pick.qty, 0)).toBe(3);
  });

  it('teslim edilmiş sipariş kuyruğa girmez — arşiv yığılmaz', async () => {
    const { orderId, itemId } = await confirmedOrder(1);
    await orders.recordPreparation(orderId, [{ orderItemId: itemId, batches: [{ stockId: nearBatch, qty: 1 }] }]);
    for (const status of ['ready', 'out_for_delivery'] as const) await transitionOrder({ orderId, to: status });

    expect((await listPreparationQueue()).some((row) => row.orderId === orderId)).toBe(false);
  });

  it('gün süzgeci: başka günün siparişi listede yok', async () => {
    await confirmedOrder(1, { deliveryDate: dayOffset(1) });
    await confirmedOrder(1, { deliveryDate: dayOffset(5) });

    const today = await listPreparationQueue({ deliveryDate: dayOffset(1) });

    expect(today.every((row) => row.deliveryDate === dayOffset(1))).toBe(true);
    expect(today.filter((row) => row.customerName === 'Ayşe Yılmaz')).toHaveLength(1);
  });
});

describe('partiye kilitli kalem (10.2)', () => {
  it('kilitli kalemde öneri o partiye sabitlenir, FEFO devreye girmez', async () => {
    const { orderId } = await confirmedOrder(2, { pinTo: farBatch }); // FEFO yakın partiyi önerirdi

    const line = (await listPreparationQueue()).find((row) => row.orderId === orderId)!.lines[0]!;

    expect(line.pinnedStockId).toBe(farBatch);
    expect(line.suggestion).toEqual([{ stockId: farBatch, qty: 2, expiryDate: dayOffset(90), location: 'Dolap B' }]);
  });

  it('kilitli kalem başka partiden verilemez — yazım HİÇ yapılmaz', async () => {
    const { orderId, itemId } = await confirmedOrder(2, { pinTo: farBatch });

    const outcome = await confirmPreparation({ orderId, picks: [{ orderItemId: itemId, batches: [{ stockId: nearBatch, qty: 2 }] }] });

    expect(outcome).toMatchObject({ status: 'pinned_violation', itemId, requiredStockId: farBatch });
    expect(await orders.listBatches(orderId)).toHaveLength(0);
  });
});

describe('hazırlık onayı ve eksik kararı (10.3)', () => {
  it('tamamı toplanınca sipariş HAZIR olur', async () => {
    const { orderId, itemId } = await confirmedOrder(3);

    const outcome = await confirmPreparation({ orderId, picks: [{ orderItemId: itemId, batches: [{ stockId: nearBatch, qty: 3 }] }] });

    expect(outcome).toMatchObject({ status: 'ok', items: 1, ready: true, shortfalls: [] });
    expect((await orders.getById(orderId))?.status).toBe('ready');
  });

  it('eksik varsa sipariş `preparing`te KALIR — karar depocunun', async () => {
    const { orderId, itemId } = await confirmedOrder(4);

    const outcome = await confirmPreparation({ orderId, picks: [{ orderItemId: itemId, batches: [{ stockId: nearBatch, qty: 1 }] }] });

    expect(outcome).toMatchObject({ status: 'ok', ready: false });
    expect((await orders.getById(orderId))?.status).not.toBe('ready');
  });

  it('büyük eksikte "müşteriye sor" önerilir, tavsiye TUTAR taşımaz', async () => {
    const { orderId, itemId } = await confirmedOrder(4);

    const outcome = await confirmPreparation({ orderId, picks: [{ orderItemId: itemId, batches: [{ stockId: nearBatch, qty: 1 }] }] });

    const shortfall = outcome.status === 'ok' ? outcome.shortfalls[0] : null;
    expect(shortfall?.suggestion).toEqual({ action: 'ask_customer', reason: 'large_share', missingQty: 3 });
  });

  it('küçük eksikte "kalanı gönder" önerilir', async () => {
    const { orderId, itemId } = await confirmedOrder(10);

    const outcome = await confirmPreparation({
      orderId,
      picks: [{ orderItemId: itemId, batches: [{ stockId: nearBatch, qty: 4 }, { stockId: farBatch, qty: 5 }] }],
    });

    const shortfall = outcome.status === 'ok' ? outcome.shortfalls[0] : null;
    expect(shortfall?.suggestion).toMatchObject({ action: 'send_rest', missingQty: 1 });
  });
});
