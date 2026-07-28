import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CategoryService, OrderService, ProductService, ReservationService, StockService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { createCheckoutSession, type CheckoutSessionCreator } from './checkout-session';
import { transitionOrder } from './transition';

/**
 * Rezervasyon → ödeme sırası (07.4). Doğrulanan tek şey: **ödeme, mal ayrılmadan açılmıyor** ve
 * ayrılamadığında hiç açılmıyor — arada kalan ayırma da geride bırakılmıyor.
 *
 * Stripe'a ağdan gidilmez: oturum üreteci bir porttur, test sahtesini verir.
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
const createdProfiles: string[] = [];

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** Sahte oturum üreteci — çağrıldığını ve neyle çağrıldığını kaydeder. */
function fakeCreator() {
  const calls: Parameters<CheckoutSessionCreator>[0][] = [];
  const creator: CheckoutSessionCreator = async (params) => {
    calls.push(params);
    return { id: `cs_test_${calls.length}`, url: 'https://checkout.stripe.test/session' };
  };
  return { creator, calls };
}

beforeAll(async () => {
  const category = await new CategoryService(db).create({ name: { tr: `Ödeme testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Su Böreği ${stamp}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  const profile = await new UserProfileService(db).insert({ name: `Ödeme müşterisi ${stamp}`, email: `pay-${stamp}@example.test` });
  customerId = profile.id;
  createdProfiles.push(profile.id);
});

beforeEach(async () => {
  await db.from('order').delete().eq('customer_id', customerId);
  await db.from('reservation').delete().eq('variant_id', variantId);
  await db.from('stock').delete().eq('variant_id', variantId);
  await stocks.insert({ variantId, physicalQty: 5, expiryDate: dayOffset(30), purchasePrice: 4 });
});

afterAll(async () => {
  await db.from('order').delete().eq('customer_id', customerId);
  await db.from('reservation').delete().eq('variant_id', variantId);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: createdProfiles });
});

async function draftOrder(qty: number) {
  const { order } = await orders.create(
    { customerId, channel: 'b2c', deliveryType: 'route', total: qty * 10 },
    [{ variantId, qty, unitPrice: 10, vatRate: 5.5 }],
  );
  return order.id;
}

const urls = { successUrl: 'https://lezzet.test/ok', cancelUrl: 'https://lezzet.test/cancel' };

describe('önce ayır, sonra öde (07.4)', () => {
  it('stok ayrılır ve oturum TTL ile aynı anda biter', async () => {
    const orderId = await draftOrder(2);
    const { creator, calls } = fakeCreator();

    const outcome = await createCheckoutSession({ orderId, ...urls }, creator);

    expect(outcome).toMatchObject({ status: 'ok', sessionId: 'cs_test_1' });
    const active = await reservations.listActiveByOrder(orderId);
    expect(active.reduce((sum, row) => sum + row.qty, 0)).toBe(2);

    // Pencereler eşit: oturumun bitişi rezervasyon TTL'i (30 dk) kadar ileride.
    const minutesAhead = (calls[0]!.expiresAtEpoch * 1000 - Date.now()) / 60_000;
    expect(minutesAhead).toBeGreaterThan(29);
    expect(minutesAhead).toBeLessThanOrEqual(30);
  });

  it('stok yetmezse ödeme HİÇ açılmaz', async () => {
    const orderId = await draftOrder(9); // elde 5 var
    const { creator, calls } = fakeCreator();

    const outcome = await createCheckoutSession({ orderId, ...urls }, creator);

    expect(outcome).toMatchObject({ status: 'insufficient_stock', variantId, available: 5 });
    expect(calls).toHaveLength(0); // sağlayıcıya hiç gidilmedi
  });

  it('kalemlerden biri ayrılamazsa ÖNCEKİLER geri bırakılır', async () => {
    // İki kalem: ilki elde olanı bitirir, ikincisi ayrılamaz.
    const { order } = await orders.create(
      { customerId, channel: 'b2c', total: 80 },
      [
        { variantId, qty: 5, unitPrice: 10, vatRate: 5.5 },
        { variantId, qty: 3, unitPrice: 10, vatRate: 5.5 },
      ],
    );
    const { creator } = fakeCreator();

    const outcome = await createCheckoutSession({ orderId: order.id, ...urls }, creator);

    expect(outcome.status).toBe('insufficient_stock');
    // İlk kalemin ayırması geride kalsaydı stok 30 dakika boşuna kilitli olurdu.
    expect(await reservations.listActiveByOrder(order.id)).toHaveLength(0);
    expect((await stocks.getAvailable(variantId)).availableQty).toBe(5);
  });

  it('taslak olmayan siparişte ödeme açılmaz', async () => {
    const orderId = await draftOrder(1);
    await transitionOrder({ orderId, to: 'confirmed' });
    const { creator } = fakeCreator();

    expect(await createCheckoutSession({ orderId, ...urls }, creator)).toMatchObject({ status: 'stale', currentStatus: 'confirmed' });
  });

  it('sağlayıcı yoksa stok AYRILMADAN dönülür', async () => {
    const orderId = await draftOrder(2);

    const outcome = await createCheckoutSession({ orderId, ...urls }, null);

    expect(outcome).toMatchObject({ status: 'provider_unavailable' });
    expect(await reservations.listActiveByOrder(orderId)).toHaveLength(0);
  });

  it('edinim kaynağı YALNIZ ilk siparişte yazılır, izin işaretliyse kaydedilir', async () => {
    const profiles = new UserProfileService(db);
    const { creator } = fakeCreator();

    await createCheckoutSession(
      { orderId: await draftOrder(1), ...urls, marketingConsent: true, acquisitionSource: { utm_source: 'instagram' } },
      creator,
    );
    const first = await profiles.getById(customerId);

    await createCheckoutSession(
      { orderId: await draftOrder(1), ...urls, acquisitionSource: { utm_source: 'google' } },
      creator,
    );
    const second = await profiles.getById(customerId);

    // jsonb anahtarları da case dönüşümünden geçer: `utm_source` okumada `utmSource` olur.
    expect(first?.acquisitionSource).toMatchObject({ utmSource: 'instagram' });
    expect(first?.marketingConsent).toMatchObject({ email: { granted: true, source: 'checkout' } });
    expect(second?.acquisitionSource).toMatchObject({ utmSource: 'instagram' }); // google EZMEDİ
  });
});
