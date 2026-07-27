import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, MoneyMovementService, OrderItemService, OrderService, ProductService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
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

const damga = Date.now();
let customerId: string;
let variantId: string;
let productId: string;
let categoryId: string;
let kasa: string;
const acilanProfiller: string[] = [];

beforeAll(async () => {
  const category = await new CategoryService(db).create({ name: { tr: `Para testi ${damga}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Tulumba ${damga}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  const profile = await new UserProfileService(db).insert({ name: `Para müşterisi ${damga}` });
  customerId = profile.id;
  acilanProfiller.push(profile.id);
  kasa = (await accounts.insert({ name: `Test kasası ${damga}`, type: 'cash' })).id;
});

beforeEach(async () => {
  await db.from('money_movement').delete().eq('account_id', kasa);
  await db.from('order').delete().eq('customer_id', customerId);
});

afterAll(async () => {
  await db.from('money_movement').delete().eq('account_id', kasa);
  await db.from('order').delete().eq('customer_id', customerId);
  await db.from('account').delete().eq('id', kasa);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: acilanProfiller });
});

/** 2 × 25 € = 50 € tutarında, tamamı karşılanmış sipariş. */
async function siparisAc(qty = 2, unitPrice = 25, shippingFee = 0) {
  const { order, items } = await orders.create(
    { customerId, channel: 'b2c', total: qty * unitPrice + shippingFee, shippingFee },
    [{ variantId, qty, unitPrice, vatRate: 5.5, fulfilledQty: qty }],
  );
  return { order, items };
}

describe('tahsilat → cache → ödeme durumu', () => {
  it('tahsilat cache\'i besler ve durumu `paid` yapar', async () => {
    const { order } = await siparisAc();

    const sonuc = await recordOrderPayment({ orderId: order.id, accountId: kasa, amount: 50, description: 'Kapıda nakit' });
    expect(sonuc).toMatchObject({ status: 'ok', amountCollected: 50, paymentStatus: 'paid' });

    const guncel = await orders.getById(order.id);
    expect(guncel).toMatchObject({ amountCollected: 50, paymentStatus: 'paid' });
  });

  it('eksik tahsilat `partial` bırakır; kalan tutar türetilir', async () => {
    const { order } = await siparisAc();

    const sonuc = await recordOrderPayment({ orderId: order.id, accountId: kasa, amount: 20 });
    expect(sonuc.status).toBe('ok');
    if (sonuc.status !== 'ok') return;
    expect(sonuc.paymentStatus).toBe('partial');
    expect(sonuc.derivation.amountToCollectCents).toBe(3000); // 50 − 20
  });

  it('iki tahsilat toplanır — cache ARTIRILMAZ, kaynaktan yeniden hesaplanır', async () => {
    const { order } = await siparisAc();
    await recordOrderPayment({ orderId: order.id, accountId: kasa, amount: 20 });
    const sonuc = await recordOrderPayment({ orderId: order.id, accountId: kasa, amount: 30 });

    expect(sonuc).toMatchObject({ amountCollected: 50, paymentStatus: 'paid' });
    expect((await movements.listByOrder(order.id))).toHaveLength(2);
  });

  it('iade net tahsilatı düşürür; tamamı geri dönerse durum `refunded` olur', async () => {
    const { order } = await siparisAc();
    await recordOrderPayment({ orderId: order.id, accountId: kasa, amount: 50 });

    const sonuc = await recordOrderRefund({ orderId: order.id, accountId: kasa, amount: 50, description: 'Ürün beğenilmedi' });
    expect(sonuc).toMatchObject({ amountCollected: 50, amountRefunded: 50, paymentStatus: 'refunded' });
  });

  it('fazla tahsilat yeni durum AÇMAZ: `paid` kalır, fark iade borcu olarak türetilir', async () => {
    const { order } = await siparisAc();

    const sonuc = await recordOrderPayment({ orderId: order.id, accountId: kasa, amount: 60 });
    expect(sonuc.status).toBe('ok');
    if (sonuc.status !== 'ok') return;
    expect(sonuc.paymentStatus).toBe('paid');
    expect(sonuc.derivation.refundDueCents).toBe(1000); // 60 − 50
  });

  it('kargo ücreti karşılanan tutara girer', async () => {
    const { order } = await siparisAc(1, 25, 7.9);

    expect(await recordOrderPayment({ orderId: order.id, accountId: kasa, amount: 25 })).toMatchObject({ paymentStatus: 'partial' });
    expect(await recordOrderPayment({ orderId: order.id, accountId: kasa, amount: 7.9 })).toMatchObject({ paymentStatus: 'paid' });
  });
});

describe('durum TÜRETİLİR — tahsilat değişmeden de değişir', () => {
  it('kalem eksik karşılanınca tam ödenmiş sipariş FAZLA ödenmiş olur', async () => {
    const { order, items } = await siparisAc(); // 2 × 25 = 50
    await recordOrderPayment({ orderId: order.id, accountId: kasa, amount: 50 });

    // Kapıda bir adet eksik çıktı: para hiç değişmedi ama karşılanan tutar yarıya indi.
    await new OrderItemService(db).setFulfilled(items[0]!.id, 1);

    const sonuc = await syncOrderPaymentStatus(order.id);
    expect(sonuc.status).toBe('ok');
    if (sonuc.status !== 'ok') return;
    expect(sonuc.paymentStatus).toBe('paid'); // net (50) ≥ karşılanan (25)
    expect(sonuc.derivation.refundDueCents).toBe(2500); // müşteriye 25 € borç
  });

  it('iptal edilen siparişte karşılanan 0 sayılır — tahsilatın tamamı iade borcudur', async () => {
    const { order } = await siparisAc();
    await recordOrderPayment({ orderId: order.id, accountId: kasa, amount: 50 });
    await db.from('order').update({ status: 'cancelled' }).eq('id', order.id);

    const sonuc = await syncOrderPaymentStatus(order.id);
    expect(sonuc.status).toBe('ok');
    if (sonuc.status !== 'ok') return;
    expect(sonuc.derivation.fulfilledAmountCents).toBe(0);
    expect(sonuc.derivation.refundDueCents).toBe(5000);
  });

  it('hareket elle silinirse cache kendini düzeltir', async () => {
    const { order } = await siparisAc();
    await recordOrderPayment({ orderId: order.id, accountId: kasa, amount: 50 });
    await db.from('money_movement').delete().eq('order_id', order.id);

    const sonuc = await syncOrderPaymentStatus(order.id);
    expect(sonuc).toMatchObject({ amountCollected: 0, paymentStatus: 'pending' });
    expect((await orders.getById(order.id))?.amountCollected).toBe(0);
  });

  it('olmayan sipariş', async () => {
    expect(await syncOrderPaymentStatus('00000000-0000-0000-0000-000000000000')).toEqual({ status: 'not_found' });
  });
});

describe('hareket tablosuyla birebir', () => {
  it('sipariş tahsilat toplamı hareketlerin toplamına eşittir', async () => {
    const { order } = await siparisAc(4, 12.5); // 50 €
    await recordOrderPayment({ orderId: order.id, accountId: kasa, amount: 12.5 });
    await recordOrderPayment({ orderId: order.id, accountId: kasa, amount: 17.5 });
    await recordOrderRefund({ orderId: order.id, accountId: kasa, amount: 5 });

    const hareketler = await movements.listByOrder(order.id);
    const tahsilat = hareketler.filter((h) => h.type === 'order_payment').reduce((s, h) => s + h.amount, 0);
    const iade = hareketler.filter((h) => h.type === 'order_refund').reduce((s, h) => s + h.amount, 0);

    const guncel = await orders.getById(order.id);
    expect(guncel?.amountCollected).toBe(tahsilat);
    expect(guncel?.amountRefunded).toBe(iade);
  });

  it('sipariş parası hesabın bakiyesine de düşer — tek defter', async () => {
    const { order } = await siparisAc();
    const once = (await accounts.balance(kasa)).balance;

    await recordOrderPayment({ orderId: order.id, accountId: kasa, amount: 50 });
    await recordOrderRefund({ orderId: order.id, accountId: kasa, amount: 10 });

    expect((await accounts.balance(kasa)).balance).toBe(once + 40);
  });
});
