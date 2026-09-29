import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AddressService,
  CartService,
  CategoryService,
  DeliveryZoneService,
  OrderService,
  PriceService,
  ProductService,
  ReservationService,
  StockService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, mustDelete, purgeTestData, purgeVariantStock, testPostalCode } from '@lezzet/database/testing';
import type { PaymentIntentStatus } from '@lezzet/domain-core';
import type { PaymentMethod } from '@lezzet/types';
import type { CheckoutSessionCreator } from './checkout-session';
import type { PaymentGateway } from './payment-gateway';
import { listCustomerOrders } from './customer-orders';
import { cancelPendingOrder, resumePendingPayment } from './pending-payment';
import { placeOrder } from './place-order';
import { reconcileDraftPayment } from './reconcile-payment';
import { readDeliveryInputs, resolveDelivery } from './delivery';

/**
 * Kart siparişinin taslak modeli: ödeme açılınca kalemler sepetten siparişe geçer, ödeme gelmezse ya da müşteri vazgeçerse geri
 * döner; aynı basış aynı taslağın ödemesine döner ve yeni sipariş bekleyen taslağa dokunmaz. Stripe sahte, gerisi gerçek.
 */
const db = serviceDb();
const stamp = Date.now();
const kod = testPostalCode();
let warehouseId = '';
let categoryId = '';
let productId = '';
let variantId = '';
let customerId = '';
let yabanciId = '';
let addressId = '';
let zoneId = '';
let gun = '';

/** Stripe'ın gerçeği: ödeme kimliği → durum; iptal durumu değiştirir. */
const odemeler = new Map<string, { status: PaymentIntentStatus; orderId: string; clientSecret: string }>();
let oturum = 0;
const createPaymentSession: CheckoutSessionCreator = async ({ orderId }) => {
  const id = `pi_taslak_${stamp}_${++oturum}`;
  odemeler.set(id, { status: 'requires_payment_method', orderId, clientSecret: `secret_${oturum}` });
  return { id, clientSecret: `secret_${oturum}` };
};
const gateway: PaymentGateway = {
  read: async (id) => {
    const odeme = odemeler.get(id);
    if (!odeme) return null;
    return {
      id,
      status: odeme.status,
      amountReceivedCents: odeme.status === 'succeeded' ? 6000 : 0,
      orderId: odeme.orderId,
      clientSecret: odeme.clientSecret,
    };
  },
  cancel: async (id) => {
    const odeme = odemeler.get(id);
    if (odeme) odeme.status = 'canceled';
  },
  refund: async () => undefined,
};
const haberler: string[] = [];
const deps = { gateway, effects: { notifyException: async (_id: string, event: string) => void haberler.push(event) } };

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Taslak modeli ${stamp}` } })).id;
  const urun = await new ProductService(db).create({
    name: { tr: `Taslak böreği ${stamp}` },
    categoryId,
    vatRate: 5.5,
    variants: [{ label: { tr: '1 kg' }, sku: `TSL-${stamp}` }],
  });
  productId = urun.product.id;
  variantId = urun.variants[0]!.id;
  await new PriceService(db).setPrice({ variantId, channel: 'b2c', amountCents: 6000 });
  await new StockService(db).insert({ warehouseId, variantId, physicalQty: 50, expiryDate: '2027-06-01', purchasePriceCents: 800 });
  const profiles = new UserProfileService(db);
  customerId = (await profiles.insert({ name: `Taslak müşterisi ${stamp}`, phone: `+3363333${String(stamp).slice(-4)}` })).id;
  yabanciId = (await profiles.insert({ name: `Yabancı müşteri ${stamp}`, phone: `+3363334${String(stamp).slice(-4)}` })).id;
  const zones = new DeliveryZoneService(db);
  zoneId = (await zones.insert({ name: `Taslak rotası ${stamp}`, warehouseId, weekdays: [1, 2, 3, 4, 5, 6, 7] })).id;
  await zones.replacePostalCodes(zoneId, [{ country: 'FR', postalCode: kod }]);
  addressId = (
    await new AddressService(db).addForCustomer({
      customerId,
      recipient: 'Taslak Alıcı',
      phone: '+33612345678',
      line1: '1 rue du Test',
      postalCode: kod,
      city: 'Strasbourg',
    })
  ).id;
  const inputs = await readDeliveryInputs(db);
  gun = (await resolveDelivery(db, { postalCode: kod, country: 'FR', inputs })).availableDates[0]!;
});

beforeEach(async () => {
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  await sepeteKoy(1);
  haberler.length = 0;
});

afterAll(async () => {
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  await new CartService(db).clear(customerId);
  await purgeVariantStock(db, [variantId]);
  await db.from('address').delete().eq('customer_id', customerId);
  await db.from('delivery_zone').delete().eq('id', zoneId);
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: [customerId, yabanciId],
    warehouseIds: [warehouseId],
  });
});

const sepeteKoy = (qty: number) => new CartService(db).replace(customerId, [{ variantId, qty, stockId: null, unitPrice: 60 }]);
const sepet = async () => (await new CartService(db).get(customerId)).items.map((row) => ({ variantId: row.variantId, qty: row.qty }));
const durum = async (orderId: string) => (await new OrderService(db).getById(orderId))?.status;

const siparis = (paymentMethod: PaymentMethod, idempotencyKey: string, over: Partial<Parameters<typeof placeOrder>[1]> = {}) =>
  placeOrder(db, {
    locale: 'fr',
    customerId,
    entries: [{ kind: 'variant', variantId, qty: 1, stockId: null }],
    addressId,
    deliveryDate: gun,
    paymentMethod,
    idempotencyKey,
    createPaymentSession,
    paymentGateway: gateway,
    ...over,
  });

async function kartla(anahtar: string): Promise<{ orderId: string; clientSecret: string }> {
  const sonuc = await siparis('online', anahtar);
  if (sonuc.status !== 'payment_required') throw new Error(`ödeme açılmadı: ${sonuc.status}`);
  return sonuc;
}

describe('kart ödemesi açılınca', () => {
  it('kalemler sepetten siparişe geçer', async () => {
    await kartla(`gecer-${stamp}`);
    expect(await sepet()).toEqual([]);
  });

  it('ödeme açılamazsa taslak ve açılan ödeme kapanır, sepete dokunulmaz', async () => {
    const sonuc = await siparis('online', `acilamadi-${stamp}`, {
      createPaymentSession: async (params) => ({ ...(await createPaymentSession(params)), clientSecret: null }),
    });

    expect(sonuc).toMatchObject({ status: 'payment_unavailable', reason: 'no_client_secret' });
    const { data } = await db.from('order').select('status, payment_ref').eq('customer_id', customerId);
    expect(data?.map((row) => row.status)).toEqual(['cancelled']);
    expect(odemeler.get(data![0]!.payment_ref!)?.status).toBe('canceled');
    expect(await sepet()).toEqual([{ variantId, qty: 1 }]);
  });

  it('aynı basış ikinci taslak açmaz, aynı ödemeye döner', async () => {
    const ilk = await kartla(`ayni-${stamp}`);
    const ikinci = await siparis('online', `ayni-${stamp}`);

    expect(ikinci).toMatchObject({ status: 'payment_required', orderId: ilk.orderId, clientSecret: ilk.clientSecret });
    const { count } = await db.from('order').select('id', { count: 'exact', head: true }).eq('customer_id', customerId);
    expect(count).toBe(1);
  });

  it('eski ekrandan gelen ikinci basış sepette olmayan kalemle sipariş açmaz', async () => {
    await kartla(`eski-1-${stamp}`);

    expect(await siparis('online', `eski-2-${stamp}`)).toEqual({ status: 'cart_changed' });
    const { count } = await db.from('order').select('id', { count: 'exact', head: true }).eq('customer_id', customerId);
    expect(count).toBe(1);
  });

  it('yeni sipariş ödemesi bekleyen siparişe dokunmaz', async () => {
    const bekleyen = await kartla(`bekleyen-${stamp}`);
    await sepeteKoy(1);

    await kartla(`yeni-${stamp}`);

    expect(await durum(bekleyen.orderId)).toBe('draft');
  });
});

describe('personel siparişi', () => {
  it('müşterinin sepetine dokunmaz', async () => {
    const sonuc = await siparis('cash', `personel-${stamp}`, { staff: { actorId: yabanciId } });

    expect(sonuc.status).toBe('placed');
    expect(await sepet()).toEqual([{ variantId, qty: 1 }]);
  });
});

describe('ödemesi bekleyen sipariş', () => {
  it('pencere kapanınca kapanır, kalemler sepete döner ve "sipariş oluşmadı" haberi gider', async () => {
    const { orderId } = await kartla(`pencere-${stamp}`);
    await new ReservationService(db).releaseByOrder(orderId);

    expect((await reconcileDraftPayment(db, orderId, deps)).status).toBe('cancelled');
    expect(await sepet()).toEqual([{ variantId, qty: 1 }]);
    expect(haberler).toEqual(['order_payment_incomplete']);
  });

  it('müşteri iptal ederse ödeme ve sipariş kapanır, kalemler döner, haber gitmez', async () => {
    const { orderId } = await kartla(`iptal-${stamp}`);

    expect(await cancelPendingOrder(db, { orderId, customerId: yabanciId }, deps)).toEqual({ status: 'not_found' });
    expect(await cancelPendingOrder(db, { orderId, customerId }, deps)).toEqual({ status: 'cancelled', orderId });

    const order = await new OrderService(db).getById(orderId);
    expect(order).toMatchObject({ status: 'cancelled', cancelReason: 'customer' });
    expect(odemeler.get(order!.paymentRef!)?.status).toBe('canceled');
    expect(await sepet()).toEqual([{ variantId, qty: 1 }]);
    expect(haberler).toEqual([]);
  });

  // Liste ödemesi açılmış taslağı göstermezse kalemleri sepetten çıkmış müşteri siparişini hiçbir yerde bulamaz.
  it('siparişler listesinde "ödeme bekleniyor" satırıdır, iptal edilince listeden çıkar', async () => {
    const { orderId } = await kartla(`liste-${stamp}`);

    const once = await listCustomerOrders(db, { customerId, locale: 'fr' });
    expect(once.orders.map((row) => ({ id: row.id, status: row.status, referenceNo: row.referenceNo }))).toEqual([
      { id: orderId, status: 'awaiting_payment', referenceNo: null },
    ]);

    await cancelPendingOrder(db, { orderId, customerId }, deps);
    expect((await listCustomerOrders(db, { customerId, locale: 'fr' })).orders).toEqual([]);
  });

  it('ödemeye dönüş aynı ödemenin anahtarını verir; başkasının siparişi bulunamaz', async () => {
    const ilk = await kartla(`donus-${stamp}`);

    expect(await resumePendingPayment(db, { orderId: ilk.orderId, customerId: yabanciId }, deps)).toEqual({ status: 'not_found' });
    expect(await resumePendingPayment(db, { orderId: ilk.orderId, customerId }, deps)).toMatchObject({
      status: 'payment_required',
      orderId: ilk.orderId,
      clientSecret: ilk.clientSecret,
    });
  });

  it('iptal edilen taslağın anahtarı serbest kalır; kesinleşen sipariş tekrar isteğe aynı cevabı verir', async () => {
    const anahtar = `kesinlesti-${stamp}`;
    const { orderId } = await kartla(anahtar);
    await cancelPendingOrder(db, { orderId, customerId }, deps);

    const kapida = await siparis('cash', anahtar);
    const tekrar = await siparis('cash', anahtar);

    expect(kapida.status).toBe('placed');
    expect(tekrar).toMatchObject({ status: 'placed', orderId: (kapida as { orderId: string }).orderId });
  });
});
