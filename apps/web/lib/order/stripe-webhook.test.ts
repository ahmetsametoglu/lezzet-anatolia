import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, OrderService, ProductService, ReservationService, StockService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse, purgeVariantStock, mustDelete } from '@lezzet/database/testing';
import { handleStripeEvent, type VerifiedEvent } from './stripe-webhook';

/**
 * Stripe webhook'u (07.5). Üç şey doğrulanır: **aynı olay iki kez işlenmiyor**, ödeme onayı siparişi
 * `confirmed` yapıp referans üretiyor, ve **geç ödeme** dallanması motorun dediği gibi işliyor
 * (rezervasyon düşmüşse yeniden ayır; mal yoksa iade et).
 *
 * İmza doğrulaması burada değil: o HTTP kabuğunun işi (ham gövde ister). Buraya doğrulanmış olay gelir.
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
let stripeAccount: string;
const createdProfiles: string[] = [];

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
let eventSeq = 0;

function paidEvent(orderId: string, amountCents: number, overrides: Partial<VerifiedEvent> = {}): VerifiedEvent {
  eventSeq += 1;
  return {
    id: `evt_${stamp}_${eventSeq}`,
    // Varsayılan olay adı artık niyet ailesinden: ödeme sayfa içine alındı (28.07).
    type: 'payment_intent.succeeded',
    orderId,
    paymentIntentId: `pi_${stamp}_${eventSeq}`,
    amountTotalCents: amountCents,
    ...overrides,
  };
}

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `Webhook testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: `İçli Köfte ${stamp}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  const profile = await new UserProfileService(db).insert({ name: `Webhook müşterisi ${stamp}`, email: `wh-${stamp}@example.test` });
  customerId = profile.id;
  createdProfiles.push(profile.id);
  stripeAccount = (await new AccountService(db).insert({ name: `Stripe havuzu ${stamp}`, type: 'provider' })).id;
});

beforeEach(async () => {
  await db.from('money_movement').delete().eq('account_id', stripeAccount);
  // SIRA: defter → parti → sipariş (06.14) — künye `packages/application/src/courier/day.test.ts`te.
  await purgeVariantStock(db, [variantId]);
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  await mustDelete(db, 'reservation', (q) => q.eq('variant_id', variantId));
  await stocks.insert({ warehouseId, variantId, physicalQty: 5, expiryDate: dayOffset(30), purchasePriceCents: 400 });
});

afterAll(async () => {
  await purgeVariantStock(db, [variantId]);
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  await mustDelete(db, 'reservation', (q) => q.eq('variant_id', variantId));
  await db.from('webhook_event').delete().like('event_id', `evt_${stamp}_%`);
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    accountIds: [stripeAccount],
    warehouseIds: [warehouseId],
  });
});

/** Taslak sipariş + (istenirse) aktif rezervasyon — ödeme onayının geldiği hâl. */
async function pendingOrder(qty: number, opts: { reserve?: boolean } = { reserve: true }) {
  const { order } = await orders.create(
    { warehouseId, customerId, channel: 'b2c', deliveryType: 'route', orderedTotalCents: qty * 1000 },
    [{ variantId, qty, unitPriceCents: 1000, vatRate: 5.5 }],
  );
  if (opts.reserve) await reservations.reserve({ orderId: order.id, warehouseId, variantId, qty, ttlMinutes: 30 });
  return order.id;
}

describe('ödeme onayı', () => {
  it('sipariş `confirmed` olur, referans üretilir, tahsilat kasaya düşer', async () => {
    const orderId = await pendingOrder(2);

    const outcome = await handleStripeEvent(paidEvent(orderId, 2000), stripeAccount);

    expect(outcome).toMatchObject({ status: 'ok', action: 'confirmed' });
    const order = await orders.getById(orderId);
    expect(order?.status).toBe('confirmed');
    expect(order?.referenceNo).toBeTruthy();
    expect(order?.amountCollectedCents).toBe(2000);
    expect(order?.paymentStatus).toBe('paid');
  });

  it('tahsilat sipariş toplamından değil, GERÇEKTEN ödenenden yazılır', async () => {
    const orderId = await pendingOrder(2);

    await handleStripeEvent(paidEvent(orderId, 1850), stripeAccount);

    expect((await orders.getById(orderId))?.amountCollectedCents).toBe(1850);
  });

  it('AYNI olay ikinci kez gelirse hiçbir şey tekrarlanmaz', async () => {
    const orderId = await pendingOrder(2);
    const event = paidEvent(orderId, 2000);

    const first = await handleStripeEvent(event, stripeAccount);
    const second = await handleStripeEvent(event, stripeAccount);

    expect(first).toMatchObject({ status: 'ok' });
    expect(second).toMatchObject({ status: 'duplicate' });
    // Çift yazım olsaydı tahsilat 40 € görünürdü.
    expect((await orders.getById(orderId))?.amountCollectedCents).toBe(2000);
  });

  it('ödeme dışı olay sessizce geçilir', async () => {
    const orderId = await pendingOrder(1);

    const outcome = await handleStripeEvent(paidEvent(orderId, 1000, { type: 'payment_intent.created' }), stripeAccount);

    expect(outcome).toMatchObject({ status: 'ok', action: 'ignored' });
    expect((await orders.getById(orderId))?.status).toBe('draft');
  });
});

describe('geç ödeme — rezervasyon düşmüşken onay gelirse (DOMAIN §4)', () => {
  it('stok duruyorsa YENİDEN ayrılır ve sipariş devam eder', async () => {
    const orderId = await pendingOrder(2, { reserve: false }); // TTL dolmuş gibi: rezervasyon yok

    const outcome = await handleStripeEvent(paidEvent(orderId, 2000), stripeAccount);

    expect(outcome).toMatchObject({ status: 'ok', action: 'reserved_again' });
    expect((await orders.getById(orderId))?.status).toBe('confirmed');
    const active = await reservations.listActiveByOrder(orderId);
    expect(active.reduce((sum, row) => sum + row.qty, 0)).toBe(2);
  });

  it('stok da kalmadıysa sipariş İPTAL edilir — elle karar beklenmez', async () => {
    const orderId = await pendingOrder(4, { reserve: false });
    // Bu arada mal başkasına gitti: elde kalan 1 adet.
    const other = await orders.create({ warehouseId, customerId, channel: 'b2c' }, [{ variantId, qty: 4, unitPriceCents: 1000, vatRate: 5.5 }]);
    await reservations.reserve({ orderId: other.order.id, warehouseId, variantId, qty: 4 });

    const outcome = await handleStripeEvent(paidEvent(orderId, 4000), stripeAccount);

    expect(outcome).toMatchObject({ status: 'ok', action: 'refunded' });
    const cancelled = await orders.getById(orderId);
    expect(cancelled?.status).toBe('cancelled');
    // **SEBEP YAZILIR (07.14) ve müşteriye kurulan cümle buna bağlı:** bu dalda para GERÇEKTEN
    // çekildi ve geri verildi. Sebep gelmeden onay ekranı "tahsilat yapılmadı" diyordu — üç yolun
    // ikisinde doğru, burada yanlış. `paymentStatus` ayırt etmiyor, çünkü bu dalda tahsilat hiç
    // yazılmıyor ve durum `pending` kalıyor; test o ayrımın sebepten geldiğini çiviliyor.
    expect(cancelled?.cancelReason).toBe('out_of_stock');
    expect(cancelled?.paymentStatus).toBe('pending');
    // İade DAMGASI da düşer: ekranın "para geri verildi mi" sorusu buradan cevaplanıyor.
    expect(cancelled?.providerRefundedAt).not.toBeNull();
  });

  it('ZATEN İPTAL siparişe geç gelen ödeme de damgalanır — sebep DEĞİŞMEZ', async () => {
    // 07.14'ün kapanmayan yarısı buydu: bu dal parayı iade ediyor ama hiçbir iz bırakmıyordu.
    // Sipariş `superseded` diye iptal edilmiş; sebebi `out_of_stock`a çevirmek YALAN olurdu
    // (stok kalmıştı), sebepsiz bırakmak da ekrana "tahsilat yapılmadı" dedirtiyordu — oysa para
    // çekilmiş ve geri verilmişti. İki soru ayrı, iki kolon ayrı.
    const orderId = await pendingOrder(2, { reserve: false });
    await orders.cancel(orderId, 'draft', null, 'superseded');

    const outcome = await handleStripeEvent(paidEvent(orderId, 2000), stripeAccount);

    expect(outcome).toMatchObject({ status: 'ok', action: 'refunded' });
    const after = await orders.getById(orderId);
    expect(after?.cancelReason).toBe('superseded');
    expect(after?.providerRefundedAt).not.toBeNull();
  });
});

describe('kart reddedilirse (sayfa içi ödeme)', () => {
  it('mal GERİ BIRAKILMAZ — müşteri hâlâ sayfada, başka kart deneyecek', async () => {
    const orderId = await pendingOrder(3);

    const outcome = await handleStripeEvent(
      paidEvent(orderId, 3000, { type: 'payment_intent.payment_failed' }),
      stripeAccount,
    );

    expect(outcome).toMatchObject({ status: 'ok', action: 'ignored' });
    // Bırakılsaydı ikinci denemesinde kendi malını "tükendi" diye bulurdu.
    expect((await reservations.listActiveByOrder(orderId)).reduce((sum, row) => sum + row.qty, 0)).toBe(3);
    expect((await orders.getById(orderId))?.status).toBe('draft');
  });

  it('niyet İPTAL edilirse mal geri bırakılır', async () => {
    const orderId = await pendingOrder(3);

    const outcome = await handleStripeEvent(
      paidEvent(orderId, 3000, { type: 'payment_intent.canceled' }),
      stripeAccount,
    );

    expect(outcome).toMatchObject({ status: 'ok', action: 'expired_released' });
    expect(await reservations.listActiveByOrder(orderId)).toHaveLength(0);
  });
});

describe('oturum süresi dolarsa', () => {
  it('ayrılmış mal geri bırakılır ama sipariş TASLAK kalır', async () => {
    const orderId = await pendingOrder(3);

    const outcome = await handleStripeEvent(
      paidEvent(orderId, 3000, { type: 'checkout.session.expired' }),
      stripeAccount,
    );

    expect(outcome).toMatchObject({ status: 'ok', action: 'expired_released' });
    expect(await reservations.listActiveByOrder(orderId)).toHaveLength(0);
    // Müşteri aynı sepetle tekrar deneyebilmeli — iptal onun kararı.
    expect((await orders.getById(orderId))?.status).toBe('draft');
    expect((await stocks.getAvailable(warehouseId, variantId)).availableQty).toBe(5);
  });
});
