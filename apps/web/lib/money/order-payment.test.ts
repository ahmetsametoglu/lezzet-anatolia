import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, MoneyMovementService, OrderItemService, OrderService, ProductService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse } from '@lezzet/database/testing';
import { recordOrderPayment, recordOrderRefund, syncOrderPaymentStatus } from './order-payment';

/**
 * Siparişin para bağları (12.2). Doğrulanan zincir: **hareket → cache → ödeme durumu.**
 * Asıl mesele cache'in kaynağıyla birebir kalması; ikinci mesele durumun TÜRETİLMESİ (elle set
 * edilmemesi) — tahsilat değişmeden de değişebiliyor mu.
 */
const db = serviceDb();
const orders = new OrderService(db);
const movements = new MoneyMovementService(db);
const accounts = new AccountService(db);

const stamp = Date.now();
let customerId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
let variantId: string;
let productId: string;
let categoryId: string;
let cashAccount: string;
const createdProfiles: string[] = [];

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `Para testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Tulumba ${stamp}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  const profile = await new UserProfileService(db).insert({ name: `Para müşterisi ${stamp}` });
  customerId = profile.id;
  createdProfiles.push(profile.id);
  cashAccount = (await accounts.insert({ name: `Test kasası ${stamp}`, type: 'cash' })).id;
});

beforeEach(async () => {
  await db.from('money_movement').delete().eq('account_id', cashAccount);
  await db.from('order').delete().eq('customer_id', customerId);
});

afterAll(async () => {
  await db.from('order').delete().eq('customer_id', customerId);
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    accountIds: [cashAccount],
    warehouseIds: [warehouseId],
  });
});

/** 2 × 25 € = 50 € tutarında, tamamı karşılanmış sipariş. */
async function createOrder(qty = 2, unitPriceCents = 2500, shippingFeeCents = 0) {
  const { order, items } = await orders.create(
    { warehouseId, customerId, channel: 'b2c', orderedTotalCents: qty * unitPriceCents + shippingFeeCents, shippingFeeCents },
    [{ variantId, qty, unitPriceCents, vatRate: 5.5, fulfilledQty: qty }],
  );
  return { order, items };
}

describe('tahsilat → cache → ödeme durumu', () => {
  it('tahsilat cache\'i besler ve durumu `paid` yapar', async () => {
    const { order } = await createOrder();

    const result = await recordOrderPayment({ orderId: order.id, accountId: cashAccount, amountCents: 5000, description: 'Kapıda nakit' });
    expect(result).toMatchObject({ status: 'ok', amountCollectedCents: 5000, paymentStatus: 'paid' });

    const current = await orders.getById(order.id);
    expect(current).toMatchObject({ amountCollectedCents: 5000, paymentStatus: 'paid' });
  });

  it('eksik tahsilat `partial` bırakır; kalan tutar türetilir', async () => {
    const { order } = await createOrder();

    const result = await recordOrderPayment({ orderId: order.id, accountId: cashAccount, amountCents: 2000 });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.paymentStatus).toBe('partial');
    expect(result.derivation.amountToCollectCents).toBe(3000); // 50 − 20
  });

  it('iki tahsilat toplanır — cache ARTIRILMAZ, kaynaktan yeniden hesaplanır', async () => {
    const { order } = await createOrder();
    await recordOrderPayment({ orderId: order.id, accountId: cashAccount, amountCents: 2000 });
    const result = await recordOrderPayment({ orderId: order.id, accountId: cashAccount, amountCents: 3000 });

    expect(result).toMatchObject({ amountCollectedCents: 5000, paymentStatus: 'paid' });
    expect((await movements.listByOrder(order.id))).toHaveLength(2);
  });

  it('iade net tahsilatı düşürür; tamamı geri dönerse durum `refunded` olur', async () => {
    const { order } = await createOrder();
    await recordOrderPayment({ orderId: order.id, accountId: cashAccount, amountCents: 5000 });

    const result = await recordOrderRefund({ orderId: order.id, accountId: cashAccount, amountCents: 5000, description: 'Ürün beğenilmedi' });
    expect(result).toMatchObject({ amountCollectedCents: 5000, amountRefundedCents: 5000, paymentStatus: 'refunded' });
  });

  it('fazla tahsilat yeni durum AÇMAZ: `paid` kalır, fark iade borcu olarak türetilir', async () => {
    const { order } = await createOrder();

    const result = await recordOrderPayment({ orderId: order.id, accountId: cashAccount, amountCents: 6000 });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.paymentStatus).toBe('paid');
    expect(result.derivation.refundDueCents).toBe(1000); // 60 − 50
  });

  it('kargo ücreti karşılanan tutara girer', async () => {
    const { order } = await createOrder(1, 2500, 790);

    expect(await recordOrderPayment({ orderId: order.id, accountId: cashAccount, amountCents: 2500 })).toMatchObject({ paymentStatus: 'partial' });
    expect(await recordOrderPayment({ orderId: order.id, accountId: cashAccount, amountCents: 790 })).toMatchObject({ paymentStatus: 'paid' });
  });
});

describe('durum TÜRETİLİR — tahsilat değişmeden de değişir', () => {
  it('kalem eksik karşılanınca tam ödenmiş sipariş FAZLA ödenmiş olur', async () => {
    const { order, items } = await createOrder(); // 2 × 25 = 50
    await recordOrderPayment({ orderId: order.id, accountId: cashAccount, amountCents: 5000 });

    // Kapıda bir adet eksik çıktı: para hiç değişmedi ama karşılanan tutar yarıya indi.
    // Sipariş TESLİM edilmiş olmalı — `fulfilled_qty` ancak hazırlık kesinleştikten sonra bir
    // karardır (`isFulfillmentSettled`); taslak siparişte 0 olması "eksik gitti" demek değildir.
    await db.from('order').update({ status: 'delivered' as const }).eq('id', order.id);
    await new OrderItemService(db).setFulfilled(items[0]!.id, 1);

    const result = await syncOrderPaymentStatus(order.id);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.paymentStatus).toBe('paid'); // net (50) ≥ karşılanan (25)
    expect(result.derivation.refundDueCents).toBe(2500); // müşteriye 25 € borç
  });

  it('HAZIRLANMAMIŞ siparişte karşılanan 0 "eksik gitti" DEĞİLDİR — beklenen tutar sipariş edilendir', async () => {
    // `fulfilled_qty` varsayılanı 0'dır ve hazırlıkta yazılır. Bu ayrım gözetilmezse onaylanmış her
    // sipariş "hiçbir kalemi karşılanmamış" sayılır: kapıda tahsil edilecek tutar 0'a iner, peşin
    // ödenmiş sipariş "iade bekliyor" görünür.
    const { order, items } = await createOrder(); // 2 × 25 = 50
    await db.from('order').update({ status: 'confirmed' }).eq('id', order.id);
    await new OrderItemService(db).setFulfilled(items[0]!.id, 0);

    const openResult = await syncOrderPaymentStatus(order.id);
    expect(openResult.status).toBe('ok');
    if (openResult.status !== 'ok') return;
    expect(openResult.derivation.amountToCollectCents).toBe(5000); // tamamı tahsil edilecek
    expect(openResult.paymentStatus).toBe('pending');

    // Peşin ödenmiş hâli: iade borcu DOĞMAZ — mal daha hazırlanmadı, fazla ödeme yok.
    await recordOrderPayment({ orderId: order.id, accountId: cashAccount, amountCents: 5000 });
    const paidResult = await syncOrderPaymentStatus(order.id);
    expect(paidResult.status).toBe('ok');
    if (paidResult.status !== 'ok') return;
    expect(paidResult.derivation.refundDueCents).toBe(0);
    expect(paidResult.paymentStatus).toBe('paid');
  });

  it('iptal edilen siparişte karşılanan 0 sayılır — tahsilatın tamamı iade borcudur', async () => {
    const { order } = await createOrder();
    await recordOrderPayment({ orderId: order.id, accountId: cashAccount, amountCents: 5000 });
    await db.from('order').update({ status: 'cancelled' }).eq('id', order.id);

    const result = await syncOrderPaymentStatus(order.id);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.derivation.fulfilledAmountCents).toBe(0);
    expect(result.derivation.refundDueCents).toBe(5000);
  });

  it('hareket elle silinirse cache kendini düzeltir', async () => {
    const { order } = await createOrder();
    await recordOrderPayment({ orderId: order.id, accountId: cashAccount, amountCents: 5000 });
    await db.from('money_movement').delete().eq('order_id', order.id);

    const result = await syncOrderPaymentStatus(order.id);
    expect(result).toMatchObject({ amountCollectedCents: 0, paymentStatus: 'pending' });
    expect((await orders.getById(order.id))?.amountCollectedCents).toBe(0);
  });

  it('olmayan sipariş', async () => {
    expect(await syncOrderPaymentStatus('00000000-0000-0000-0000-000000000000')).toEqual({ status: 'not_found' });
  });
});

describe('hareket tablosuyla birebir', () => {
  it('sipariş tahsilat toplamı hareketlerin toplamına eşittir', async () => {
    const { order } = await createOrder(4, 1250); // 50 €
    await recordOrderPayment({ orderId: order.id, accountId: cashAccount, amountCents: 1250 });
    await recordOrderPayment({ orderId: order.id, accountId: cashAccount, amountCents: 1750 });
    await recordOrderRefund({ orderId: order.id, accountId: cashAccount, amountCents: 500 });

    const hareketler = await movements.listByOrder(order.id);
    const tahsilat = hareketler.filter((h) => h.type === 'order_payment').reduce((s, h) => s + h.amountCents, 0);
    const refund = hareketler.filter((h) => h.type === 'order_refund').reduce((s, h) => s + h.amountCents, 0);

    // İki taraf da cent (02.9 dilim 6) — sınırda çevrim kalmadı, iddia aynı: birebir tutmalı.
    const current = await orders.getById(order.id);
    expect(current?.amountCollectedCents).toBe(tahsilat);
    expect(current?.amountRefundedCents).toBe(refund);
  });

  it('sipariş parası hesabın bakiyesine de düşer — tek defter', async () => {
    const { order } = await createOrder();
    const before = (await accounts.balance(cashAccount)).balanceCents;

    await recordOrderPayment({ orderId: order.id, accountId: cashAccount, amountCents: 5000 });
    await recordOrderRefund({ orderId: order.id, accountId: cashAccount, amountCents: 1000 });

    expect((await accounts.balance(cashAccount)).balanceCents).toBe(before + 4000);
  });
});
