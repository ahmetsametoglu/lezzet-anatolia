import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, MoneyMovementService, OrderService, ProductService, ReservationService, StockService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse, purgeVariantStock, mustDelete, settingsSnapshot } from '@lezzet/database/testing';
import type { StripeEffects } from './stripe-effects';
import { handleStripeEvent, type VerifiedEvent } from './stripe-webhook';

/**
 * Stripe webhook'u: aynı olay iki kez işlenmez, ödeme onayı siparişi `confirmed` yapıp numara üretir ve geç ödeme motorun dediği gibi
 * dallanır (ayırma düşmüşse yeniden ayır, mal yoksa iade et). İmza doğrulaması HTTP kabuğunun işi, buraya doğrulanmış olay gelir.
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
/** Payout'un gittiği banka; ayar bu hesabı gösterir. */
let bankAccount: string;
const createdProfiles: string[] = [];

/** Sağlayıcıya sorulan iki şeyin sahtesi: ücret bilinmiyor, payout boş — eski testler ücretsiz dünyada koşar. */
const noFees: StripeEffects = { feeOf: async () => null, payoutItems: async () => [] };

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
let eventSeq = 0;

function paidEvent(orderId: string, amountCents: number, overrides: Partial<VerifiedEvent> = {}): VerifiedEvent {
  eventSeq += 1;
  return {
    id: `evt_${stamp}_${eventSeq}`,
    // Varsayılan olay adı niyet ailesinden, çünkü ödeme sayfa içinde alınır.
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
  bankAccount = (await new AccountService(db).insert({ name: `Payout bankası ${stamp}`, type: 'bank' })).id;
});

beforeEach(async () => {
  await db.from('money_movement').delete().eq('account_id', stripeAccount);
  // Sıra: defter → parti → sipariş; gerekçe `packages/application/src/courier/day.test.ts`te.
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
    accountIds: [stripeAccount, bankAccount],
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

    const outcome = await handleStripeEvent(paidEvent(orderId, 2000), stripeAccount, noFees);

    expect(outcome).toMatchObject({ status: 'ok', action: 'confirmed' });
    const order = await orders.getById(orderId);
    expect(order?.status).toBe('confirmed');
    expect(order?.referenceNo).toBeTruthy();
    expect(order?.amountCollectedCents).toBe(2000);
    expect(order?.paymentStatus).toBe('paid');
  });

  it('tahsilat sipariş toplamından değil, GERÇEKTEN ödenenden yazılır', async () => {
    const orderId = await pendingOrder(2);

    await handleStripeEvent(paidEvent(orderId, 1850), stripeAccount, noFees);

    expect((await orders.getById(orderId))?.amountCollectedCents).toBe(1850);
  });

  it('AYNI olay ikinci kez gelirse hiçbir şey tekrarlanmaz', async () => {
    const orderId = await pendingOrder(2);
    const event = paidEvent(orderId, 2000);

    const first = await handleStripeEvent(event, stripeAccount, noFees);
    const second = await handleStripeEvent(event, stripeAccount, noFees);

    expect(first).toMatchObject({ status: 'ok' });
    expect(second).toMatchObject({ status: 'duplicate' });
    // Çift yazım olsaydı tahsilat 40 € görünürdü.
    expect((await orders.getById(orderId))?.amountCollectedCents).toBe(2000);
  });

  it('ödeme dışı olay sessizce geçilir', async () => {
    const orderId = await pendingOrder(1);

    const outcome = await handleStripeEvent(paidEvent(orderId, 1000, { type: 'payment_intent.created' }), stripeAccount, noFees);

    expect(outcome).toMatchObject({ status: 'ok', action: 'ignored' });
    expect((await orders.getById(orderId))?.status).toBe('draft');
  });
});

describe('geç ödeme — rezervasyon düşmüşken onay gelirse (DOMAIN §4)', () => {
  it('stok duruyorsa YENİDEN ayrılır ve sipariş devam eder', async () => {
    const orderId = await pendingOrder(2, { reserve: false }); // TTL dolmuş gibi: rezervasyon yok

    const outcome = await handleStripeEvent(paidEvent(orderId, 2000), stripeAccount, noFees);

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

    const outcome = await handleStripeEvent(paidEvent(orderId, 4000), stripeAccount, noFees);

    expect(outcome).toMatchObject({ status: 'ok', action: 'refunded' });
    const cancelled = await orders.getById(orderId);
    expect(cancelled?.status).toBe('cancelled');
    // Sebep yazılır, çünkü bu dalda para gerçekten çekilip geri verildi; `paymentStatus` ayırt etmez, tahsilat hiç yazılmadığı
    // için durum `pending` kalır ve ayrım sebepten gelir.
    expect(cancelled?.cancelReason).toBe('out_of_stock');
    expect(cancelled?.paymentStatus).toBe('pending');
    // İade DAMGASI da düşer: ekranın "para geri verildi mi" sorusu buradan cevaplanıyor.
    expect(cancelled?.providerRefundedAt).not.toBeNull();
  });

  it('ZATEN İPTAL siparişe geç gelen ödeme de damgalanır — sebep DEĞİŞMEZ', async () => {
    // Ödeme penceresi kapanınca iptal edilen taslağa geç ödeme gelir: sebebi `out_of_stock`a çevirmek yalan, sebepsiz bırakmak
    // "tahsilat yapılmadı" dedirtirdi; para geri verildiğini damga söyler.
    const orderId = await pendingOrder(2, { reserve: false });
    await orders.cancel(orderId, 'draft', null, 'payment_failed');

    const outcome = await handleStripeEvent(paidEvent(orderId, 2000), stripeAccount, noFees);

    expect(outcome).toMatchObject({ status: 'ok', action: 'refunded' });
    const after = await orders.getById(orderId);
    expect(after?.cancelReason).toBe('payment_failed');
    expect(after?.providerRefundedAt).not.toBeNull();
  });
});

describe('kart reddedilirse (sayfa içi ödeme)', () => {
  it('mal GERİ BIRAKILMAZ — müşteri hâlâ sayfada, başka kart deneyecek', async () => {
    const orderId = await pendingOrder(3);

    const outcome = await handleStripeEvent(
      paidEvent(orderId, 3000, { type: 'payment_intent.payment_failed' }),
      stripeAccount,
      noFees,
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
      noFees,
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
      noFees,
    );

    expect(outcome).toMatchObject({ status: 'ok', action: 'expired_released' });
    expect(await reservations.listActiveByOrder(orderId)).toHaveLength(0);
    // Müşteri aynı sepetle tekrar deneyebilmeli — iptal onun kararı.
    expect((await orders.getById(orderId))?.status).toBe('draft');
    expect((await stocks.getAvailable(warehouseId, variantId)).availableQty).toBe(5);
  });
});

/*
  Stripe muhasebesi: havuza brüt girer, komisyon oradan çıkar, payout bankaya transferdir; üçü yazılınca defterdeki havuz bakiyesi
  gerçek Stripe bakiyesine eşittir. Sağlayıcıya sorulan iki şey sahte port.
*/
describe('Stripe muhasebesi — ücret ve payout (12.14)', () => {
  const movements = new MoneyMovementService(db);
  const settings = settingsSnapshot(db);
  const withFee = (feeCents: number): StripeEffects => ({
    feeOf: async () => ({ feeCents, balanceTransactionId: `txn_${stamp}_fee`, chargeId: `ch_${stamp}` }),
    payoutItems: async () => [],
  });
  const payoutEvent = (id: string, amountCents: number): VerifiedEvent => ({
    id: `evt_${stamp}_${id}`,
    type: 'payout.paid',
    orderId: null,
    paymentIntentId: null,
    amountTotalCents: null,
    payout: { id: `po_${stamp}`, amountCents, arrivalDate: dayOffset(0), currency: 'eur' },
  });
  const feeRows = async () => (await movements.ledger({ accountId: stripeAccount, type: 'expense', limit: 20 })).rows;
  const transferRows = async () => (await movements.ledger({ accountId: stripeAccount, type: 'transfer', limit: 20 })).rows;

  afterAll(() => settings.restore());

  it('ücret ÖDEME BAŞINA: havuzdan `stripe-ucreti` gideri çıkar, siparişin ücret alanı dolar', async () => {
    const orderId = await pendingOrder(2);
    const event = paidEvent(orderId, 2000);

    await handleStripeEvent(event, stripeAccount, withFee(61));

    const fees = await feeRows();
    expect(fees).toHaveLength(1);
    expect(fees[0]).toMatchObject({
      amountCents: 61, nature: 'stripe-ucreti', source: 'system', explained: true, orderId: null,
      idempotencyKey: `stripe-fee:${event.paymentIntentId}`,
    });
    expect(fees[0]!.meta).toMatchObject({ providerRef: event.paymentIntentId, orderId });
    expect((await orders.getById(orderId))?.paymentFeeCents).toBe(61);
    // Tahsilat BRÜT kaldı: ücret siparişin ödemesini küçültmez, ayrı satırdır.
    expect((await orders.getById(orderId))?.amountCollectedCents).toBe(2000);
  });

  it('ücret öğrenilemezse tahsilat yine onaylanır; payout içeriği ücreti TAMAMLAR ve havuz bakiyesi sıfırlanır', async () => {
    await settings.override('stripe_payout_account_id', bankAccount);
    const orderId = await pendingOrder(2);
    const paid = paidEvent(orderId, 2000);
    expect(await handleStripeEvent(paid, stripeAccount, noFees)).toMatchObject({ status: 'ok', action: 'confirmed' });
    expect((await orders.getById(orderId))?.paymentFeeCents).toBeNull();

    // Payout: tahsilat (2000, ücret 61) + ödeme dışı Stripe ücreti (25) → bankaya net 1914.
    const items: StripeEffects = {
      feeOf: async () => null,
      payoutItems: async () => [
        { id: `txn_${stamp}_c`, type: 'charge', amountCents: 2000, feeCents: 61, netCents: 1939, paymentIntentId: paid.paymentIntentId },
        { id: `txn_${stamp}_s`, type: 'stripe_fee', amountCents: -25, feeCents: 0, netCents: -25, paymentIntentId: null },
      ],
    };
    const outcome = await handleStripeEvent(payoutEvent('po1', 1914), stripeAccount, items);
    expect(outcome).toMatchObject({ status: 'ok', action: 'payout_recorded' });

    const transfers = await transferRows();
    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toMatchObject({
      amountCents: 1914, counterAccountId: bankAccount, source: 'system', explained: true, idempotencyKey: `stripe-payout:po_${stamp}`,
    });
    expect(transfers[0]!.meta).toMatchObject({ payoutId: `po_${stamp}`, totals: { chargesCents: 2000, feesCents: 61, charges: 1, otherCents: -25 } });
    // Onay anında öğrenilememiş ücret payout'tan tamamlandı; ödeme dışı ücret de havuzdan düştü.
    expect((await orders.getById(orderId))?.paymentFeeCents).toBe(61);
    expect((await feeRows()).map((row) => row.amountCents).sort()).toEqual([25, 61]);
    // +2000 − 61 − 25 − 1914 = 0: defterdeki havuz, Stripe'ın gerçek bakiyesi.
    expect((await new AccountService(db).balance(stripeAccount)).balanceCents).toBe(0);
    // Banka ekstresi bu ucu karşılayabilir: uç bekliyor.
    expect((await movements.listTransferLegsAwaiting(bankAccount)).map((leg) => leg.id)).toContain(transfers[0]!.id);

    // Aynı payout yeni bir olay kimliğiyle gelirse hiçbir satır tekrarlanmaz — karar veritabanının.
    await handleStripeEvent(payoutEvent('po2', 1914), stripeAccount, items);
    expect(await transferRows()).toHaveLength(1);
    expect(await feeRows()).toHaveLength(2);
  });

  it('payout hesabı ayarlı değilse olay İŞLENMEMİŞ kalır — sessizce geçilmez', async () => {
    await settings.remove('stripe_payout_account_id');

    const outcome = await handleStripeEvent(payoutEvent('po3', 500), stripeAccount, noFees);

    expect(outcome).toMatchObject({ status: 'error' });
    expect(await transferRows()).toEqual([]);
  });
});
