import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CategoryService, OrderService, ProductService, ReservationService, StockService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse } from '@lezzet/database/testing';
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
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
let variantId: string;
let productId: string;
let categoryId: string;
const createdProfiles: string[] = [];

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** Sahte niyet üreteci — çağrıldığını ve neyle çağrıldığını kaydeder. */
function fakeCreator() {
  const calls: Parameters<CheckoutSessionCreator>[0][] = [];
  const creator: CheckoutSessionCreator = async (params) => {
    calls.push(params);
    return { id: `pi_test_${calls.length}`, clientSecret: `pi_test_${calls.length}_secret` };
  };
  return { creator, calls };
}

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
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
  await stocks.insert({ warehouseId, variantId, physicalQty: 5, expiryDate: dayOffset(30), purchasePriceCents: 400 });
});

afterAll(async () => {
  await db.from('order').delete().eq('customer_id', customerId);
  await db.from('reservation').delete().eq('variant_id', variantId);
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    warehouseIds: [warehouseId],
  });
});

async function draftOrder(qty: number) {
  const { order } = await orders.create(
    { warehouseId, customerId, channel: 'b2c', deliveryType: 'route', totalCents: qty * 1000 },
    [{ variantId, qty, unitPriceCents: 1000, vatRate: 5.5 }],
  );
  return order.id;
}

describe('önce ayır, sonra öde (07.4)', () => {
  it('stok ayrılır ve niyet siparişin TOPLAMIYLA açılır', async () => {
    const orderId = await draftOrder(2);
    const { creator, calls } = fakeCreator();

    const outcome = await createCheckoutSession({ orderId }, creator);

    expect(outcome).toMatchObject({ status: 'ok', paymentIntentId: 'pi_test_1', clientSecret: 'pi_test_1_secret' });
    const active = await reservations.listActiveByOrder(orderId);
    expect(active.reduce((sum, row) => sum + row.qty, 0)).toBe(2);

    // Tutar siparişin toplamından gelir, kalemlerden yeniden toplanmaz (2 × 10,00 €).
    expect(calls[0]!.amountCents).toBe(2000);

    // Ayırma penceresi niyetin künyesine yazılır: geç ödeme dalı (07.5) bunu okuyabilsin.
    const minutesAhead = (Date.parse(calls[0]!.reservationExpiresAt) - Date.now()) / 60_000;
    expect(minutesAhead).toBeGreaterThan(29);
    expect(minutesAhead).toBeLessThanOrEqual(30);
  });

  it('stok yetmezse ödeme HİÇ açılmaz', async () => {
    const orderId = await draftOrder(9); // elde 5 var
    const { creator, calls } = fakeCreator();

    const outcome = await createCheckoutSession({ orderId }, creator);

    expect(outcome).toMatchObject({ status: 'insufficient_stock', variantId, available: 5 });
    expect(calls).toHaveLength(0); // sağlayıcıya hiç gidilmedi
  });

  it('kalemlerden biri ayrılamazsa ÖNCEKİLER geri bırakılır', async () => {
    // İki kalem: ilki elde olanı bitirir, ikincisi ayrılamaz.
    const { order } = await orders.create(
      { warehouseId, customerId, channel: 'b2c', totalCents: 8000 },
      [
        { variantId, qty: 5, unitPriceCents: 1000, vatRate: 5.5 },
        { variantId, qty: 3, unitPriceCents: 1000, vatRate: 5.5 },
      ],
    );
    const { creator } = fakeCreator();

    const outcome = await createCheckoutSession({ orderId: order.id }, creator);

    expect(outcome.status).toBe('insufficient_stock');
    // İlk kalemin ayırması geride kalsaydı stok 30 dakika boşuna kilitli olurdu.
    expect(await reservations.listActiveByOrder(order.id)).toHaveLength(0);
    expect((await stocks.getAvailable(warehouseId, variantId)).availableQty).toBe(5);
  });

  it('taslak olmayan siparişte ödeme açılmaz', async () => {
    const orderId = await draftOrder(1);
    await transitionOrder({ orderId, to: 'confirmed' });
    const { creator } = fakeCreator();

    expect(await createCheckoutSession({ orderId }, creator)).toMatchObject({ status: 'stale', currentStatus: 'confirmed' });
  });

  it('sağlayıcı yoksa stok AYRILMADAN dönülür', async () => {
    const orderId = await draftOrder(2);

    const outcome = await createCheckoutSession({ orderId }, null);

    expect(outcome).toMatchObject({ status: 'provider_unavailable' });
    expect(await reservations.listActiveByOrder(orderId)).toHaveLength(0);
  });

  it('edinim kaynağı YALNIZ ilk siparişte yazılır, izin işaretliyse kaydedilir', async () => {
    const profiles = new UserProfileService(db);
    const { creator } = fakeCreator();

    await createCheckoutSession(
      { orderId: await draftOrder(1), marketingConsent: true, acquisitionSource: { utm_source: 'instagram' } },
      creator,
    );
    const first = await profiles.getById(customerId);

    await createCheckoutSession(
      { orderId: await draftOrder(1), acquisitionSource: { utm_source: 'google' } },
      creator,
    );
    const second = await profiles.getById(customerId);

    // jsonb anahtarları da case dönüşümünden geçer: `utm_source` okumada `utmSource` olur.
    expect(first?.acquisitionSource).toMatchObject({ utmSource: 'instagram' });
    expect(first?.marketingConsent).toMatchObject({ email: { granted: true, source: 'checkout' } });
    expect(second?.acquisitionSource).toMatchObject({ utmSource: 'instagram' }); // google EZMEDİ
  });
});
