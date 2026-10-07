import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService,
  CategoryService,
  MoneyMovementService,
  OrderService,
  ProductService,
  ReservationService,
  StockService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse, purgeVariantStock, mustDelete, settingsSnapshot } from '@lezzet/database/testing';
import type { PaymentGateway } from '@lezzet/application';
import { handlePaymentEvent as handleWithGateway, type PaymentEvent } from './payment-webhook';

/**
 * Ödeme webhook'u: aynı olay iki kez işlenmez, ödeme onayı siparişi `confirmed` yapıp numara üretir ve geç ödeme motorun dediği gibi
 * dallanır (ayırma düşmüşse yeniden ayır, mal yoksa iade et). İmza ve olay çevirisi HTTP kabuğunun işi, buraya çevrilmiş olay gelir.
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
let providerAccount: string;
/** Aktarımın gittiği banka; ayar bu hesabı gösterir. */
let bankAccount: string;
let cashAccount: string;
const createdProfiles: string[] = [];

/** Geç ödeme dalının iadesi ağa çıkmaz: kök `.env`teki deneme anahtarı sahte ödeme kimliğiyle sağlayıcıya giderdi. */
const fakeGateway: PaymentGateway = { read: async () => null, cancel: async () => undefined, refund: async () => undefined };
const handlePaymentEvent = (event: PaymentEvent, accountId: string | null) => handleWithGateway(event, accountId, undefined, fakeGateway);

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
let eventSeq = 0;

function paidEvent(orderId: string, amountCents: number, fee: { feeCents: number; paymentId: string } | null = null): PaymentEvent {
  eventSeq += 1;
  return {
    key: `ORDER_COMPLETED:${stamp}_${eventSeq}`,
    kind: 'payment_completed',
    orderId,
    paymentRef: `rv_${stamp}_${eventSeq}`,
    amountCents,
    fee,
  };
}

function releasedEvent(orderId: string): PaymentEvent {
  eventSeq += 1;
  return { key: `ORDER_FAILED:${stamp}_${eventSeq}`, kind: 'payment_released', orderId, paymentRef: `rv_${stamp}_${eventSeq}` };
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
  providerAccount = (await new AccountService(db).insert({ name: `Revolut Merchant ${stamp}`, type: 'provider' })).id;
  bankAccount = (await new AccountService(db).insert({ name: `Aktarım bankası ${stamp}`, type: 'bank' })).id;
  cashAccount = (await new AccountService(db).insert({ name: `Aktarım kasası ${stamp}`, type: 'cash' })).id;
});

beforeEach(async () => {
  // Sıra: defter → parti → sipariş; gerekçe `packages/application/src/courier/day.test.ts`te.
  await purgeVariantStock(db, [variantId]);
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  // Tahsilat siparişe bağlıyken silinmez; sipariş silinince bağı boşalır.
  await db.from('money_movement').delete().eq('account_id', providerAccount);
  await mustDelete(db, 'reservation', (q) => q.eq('variant_id', variantId));
  await stocks.insert({ warehouseId, variantId, physicalQty: 5, expiryDate: dayOffset(30), purchasePriceCents: 400 });
});

afterAll(async () => {
  await purgeVariantStock(db, [variantId]);
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  await mustDelete(db, 'reservation', (q) => q.eq('variant_id', variantId));
  await db.from('webhook_event').delete().like('event_id', `%:${stamp}_%`);
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    accountIds: [providerAccount, bankAccount, cashAccount],
    warehouseIds: [warehouseId],
  });
});

/** Taslak sipariş + (istenirse) aktif rezervasyon — ödeme onayının geldiği hâl. */
async function pendingOrder(qty: number, opts: { reserve?: boolean } = { reserve: true }) {
  const { order } = await orders.create({ warehouseId, customerId, channel: 'b2c', deliveryType: 'route', orderedTotalCents: qty * 1000 }, [
    { variantId, qty, unitPriceCents: 1000, vatRate: 5.5 },
  ]);
  if (opts.reserve) await reservations.reserve({ orderId: order.id, warehouseId, variantId, qty, ttlMinutes: 30 });
  return order.id;
}

describe('ödeme onayı', () => {
  it('sipariş `confirmed` olur, referans üretilir, tahsilat kasaya düşer', async () => {
    const orderId = await pendingOrder(2);

    const outcome = await handlePaymentEvent(paidEvent(orderId, 2000), providerAccount);

    expect(outcome).toMatchObject({ status: 'ok', action: 'confirmed' });
    const order = await orders.getById(orderId);
    expect(order?.status).toBe('confirmed');
    expect(order?.referenceNo).toBeTruthy();
    expect(order?.amountCollectedCents).toBe(2000);
    expect(order?.paymentStatus).toBe('paid');
  });

  it('tahsilat sipariş toplamından değil, GERÇEKTEN ödenenden yazılır', async () => {
    const orderId = await pendingOrder(2);

    await handlePaymentEvent(paidEvent(orderId, 1850), providerAccount);

    expect((await orders.getById(orderId))?.amountCollectedCents).toBe(1850);
  });

  it('AYNI olay ikinci kez gelirse hiçbir şey tekrarlanmaz', async () => {
    const orderId = await pendingOrder(2);
    const event = paidEvent(orderId, 2000);

    const first = await handlePaymentEvent(event, providerAccount);
    const second = await handlePaymentEvent(event, providerAccount);

    expect(first).toMatchObject({ status: 'ok' });
    expect(second).toMatchObject({ status: 'duplicate' });
    // Çift yazım olsaydı tahsilat 40 € görünürdü.
    expect((await orders.getById(orderId))?.amountCollectedCents).toBe(2000);
  });

  it('ödeme dışı olay sessizce geçilir', async () => {
    const orderId = await pendingOrder(1);

    eventSeq += 1;
    const outcome = await handlePaymentEvent({ key: `ORDER_AUTHORISED:${stamp}_${eventSeq}`, kind: 'ignored' }, providerAccount);

    expect(outcome).toMatchObject({ status: 'ok', action: 'ignored' });
    expect((await orders.getById(orderId))?.status).toBe('draft');
  });
});

describe('geç ödeme — rezervasyon düşmüşken onay gelirse (DOMAIN §4)', () => {
  it('stok duruyorsa YENİDEN ayrılır ve sipariş devam eder', async () => {
    const orderId = await pendingOrder(2, { reserve: false }); // TTL dolmuş gibi: rezervasyon yok

    const outcome = await handlePaymentEvent(paidEvent(orderId, 2000), providerAccount);

    expect(outcome).toMatchObject({ status: 'ok', action: 'reserved_again' });
    expect((await orders.getById(orderId))?.status).toBe('confirmed');
    const active = await reservations.listActiveByOrder(orderId);
    expect(active.reduce((sum, row) => sum + row.qty, 0)).toBe(2);
  });

  it('stok da kalmadıysa sipariş İPTAL edilir — elle karar beklenmez', async () => {
    const orderId = await pendingOrder(4, { reserve: false });
    // Bu arada mal başkasına gitti: elde kalan 1 adet.
    const other = await orders.create({ warehouseId, customerId, channel: 'b2c' }, [
      { variantId, qty: 4, unitPriceCents: 1000, vatRate: 5.5 },
    ]);
    await reservations.reserve({ orderId: other.order.id, warehouseId, variantId, qty: 4 });

    const outcome = await handlePaymentEvent(paidEvent(orderId, 4000), providerAccount);

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

    const outcome = await handlePaymentEvent(paidEvent(orderId, 2000), providerAccount);

    expect(outcome).toMatchObject({ status: 'ok', action: 'refunded' });
    const after = await orders.getById(orderId);
    expect(after?.cancelReason).toBe('payment_failed');
    expect(after?.providerRefundedAt).not.toBeNull();
  });
});

describe('kart reddedilirse (sayfa içi ödeme)', () => {
  it('mal GERİ BIRAKILMAZ — müşteri hâlâ sayfada, başka kart deneyecek', async () => {
    const orderId = await pendingOrder(3);

    // Revolut reddi `ORDER_PAYMENT_DECLINED` olarak bildirir ve çeviri onu işlenmeyen olaya indirir.
    eventSeq += 1;
    const outcome = await handlePaymentEvent({ key: `ORDER_PAYMENT_DECLINED:${stamp}_${eventSeq}`, kind: 'ignored' }, providerAccount);

    expect(outcome).toMatchObject({ status: 'ok', action: 'ignored' });
    // Bırakılsaydı ikinci denemesinde kendi malını "tükendi" diye bulurdu.
    expect((await reservations.listActiveByOrder(orderId)).reduce((sum, row) => sum + row.qty, 0)).toBe(3);
    expect((await orders.getById(orderId))?.status).toBe('draft');
  });

  it('ödeme İPTAL edilirse mal geri bırakılır', async () => {
    const orderId = await pendingOrder(3);

    const outcome = await handlePaymentEvent(releasedEvent(orderId), providerAccount);

    expect(outcome).toMatchObject({ status: 'ok', action: 'released' });
    expect(await reservations.listActiveByOrder(orderId)).toHaveLength(0);
  });
});

describe('ödemenin süresi dolarsa', () => {
  it('ayrılmış mal geri bırakılır ama sipariş TASLAK kalır', async () => {
    const orderId = await pendingOrder(3);

    const outcome = await handlePaymentEvent(releasedEvent(orderId), providerAccount);

    expect(outcome).toMatchObject({ status: 'ok', action: 'released' });
    expect(await reservations.listActiveByOrder(orderId)).toHaveLength(0);
    // Müşteri aynı sepetle tekrar deneyebilmeli — iptal onun kararı.
    expect((await orders.getById(orderId))?.status).toBe('draft');
    expect((await stocks.getAvailable(warehouseId, variantId)).availableQty).toBe(5);
  });
});

/*
  Kart muhasebesi: havuza brüt girer, komisyon oradan çıkar, aktarım bankaya transferdir; üçü yazılınca defterdeki havuz bakiyesi
  sağlayıcının gerçek bakiyesine eşittir. Komisyon olayla gelir, çünkü sağlayıcı onu tahsilden hemen sonra yazar.
*/
describe('kart muhasebesi — komisyon ve aktarım', () => {
  const movements = new MoneyMovementService(db);
  const settings = settingsSnapshot(db);
  const payoutEvent = (key: string, amountCents: number): PaymentEvent => ({
    key: `PAYOUT_COMPLETED:${stamp}_${key}`,
    kind: 'payout_completed',
    payout: { id: `po_${stamp}`, amountCents, currency: 'EUR', valueDate: dayOffset(0) },
  });
  const feeRows = async () => (await movements.ledger({ accountId: providerAccount, type: 'expense', limit: 20 })).rows;
  const transferRows = async () => (await movements.ledger({ accountId: providerAccount, type: 'transfer', limit: 20 })).rows;

  afterAll(() => settings.restore());

  it('komisyon ÖDEME BAŞINA: havuzdan `kart-komisyonu` gideri çıkar, siparişin komisyon alanı dolar, tahsilat brüt kalır', async () => {
    const orderId = await pendingOrder(2);
    const event = paidEvent(orderId, 2000, { feeCents: 61, paymentId: `p_${stamp}` });
    const paymentRef = event.kind === 'payment_completed' ? event.paymentRef : '';

    await handlePaymentEvent(event, providerAccount);

    const fees = await feeRows();
    expect(fees).toHaveLength(1);
    expect(fees[0]).toMatchObject({
      amountCents: 61,
      nature: 'kart-komisyonu',
      source: 'system',
      explained: true,
      orderId: null,
      idempotencyKey: `card-fee:${paymentRef}`,
    });
    expect(fees[0]!.meta).toMatchObject({ providerRef: paymentRef, orderId });
    expect((await orders.getById(orderId))?.paymentFeeCents).toBe(61);
    expect((await orders.getById(orderId))?.amountCollectedCents).toBe(2000);
  });

  it('komisyonu henüz yazılmamış ödeme yine onaylanır; komisyon bilinmiyor kalır, sıfır yazılmaz', async () => {
    const orderId = await pendingOrder(2);
    expect(await handlePaymentEvent(paidEvent(orderId, 2000), providerAccount)).toMatchObject({ status: 'ok', action: 'confirmed' });
    expect((await orders.getById(orderId))?.paymentFeeCents).toBeNull();
    expect(await feeRows()).toEqual([]);
  });

  it('aktarım havuzdan bankaya TRANSFER olarak yazılır ve bankanın karşılayacağı uç bekler; ikinci olay satır doğurmaz', async () => {
    await settings.override('card_payout_account_id', bankAccount);

    const outcome = await handlePaymentEvent(payoutEvent('po1', 1914), providerAccount);
    expect(outcome).toMatchObject({ status: 'ok', action: 'payout_recorded' });

    const transfers = await transferRows();
    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toMatchObject({
      amountCents: 1914,
      counterAccountId: bankAccount,
      source: 'system',
      explained: true,
      idempotencyKey: `card-payout:po_${stamp}`,
    });
    expect((await movements.listTransferLegsAwaiting(bankAccount)).map((leg) => leg.id)).toContain(transfers[0]!.id);

    // Aynı aktarım yeni bir olay anahtarıyla gelirse satır tekrarlanmaz — karar veritabanının.
    await handlePaymentEvent(payoutEvent('po2', 1914), providerAccount);
    expect(await transferRows()).toHaveLength(1);
  });

  it('aktarım hesabı ayarlı değilse olay İŞLENMEMİŞ kalır — sessizce geçilmez', async () => {
    await settings.remove('card_payout_account_id');

    const outcome = await handlePaymentEvent(payoutEvent('po3', 500), providerAccount);

    expect(outcome).toMatchObject({ status: 'error' });
    expect(await transferRows()).toEqual([]);
  });

  it('düşen olay sağlayıcının yeniden göndermesiyle işlenir — tekrar "yinelenen" sayılıp atlanmaz, aktarım kaybolmaz', async () => {
    await settings.remove('card_payout_account_id');
    const event: PaymentEvent = {
      key: `PAYOUT_COMPLETED:${stamp}_po6`,
      kind: 'payout_completed',
      payout: { id: `po_${stamp}_tekrar`, amountCents: 700, currency: 'EUR', valueDate: dayOffset(0) },
    };
    expect(await handlePaymentEvent(event, providerAccount)).toMatchObject({ status: 'error' });

    await settings.override('card_payout_account_id', bankAccount);
    expect(await handlePaymentEvent(event, providerAccount)).toMatchObject({ status: 'ok', action: 'payout_recorded' });
    expect((await transferRows()).filter((row) => row.amountCents === 700)).toHaveLength(1);
  });

  it('aktarım hesabı banka değilse olay işlenmemiş kalır — kart parası bankadan başka hesaba yazılmaz', async () => {
    await settings.override('card_payout_account_id', cashAccount);

    const outcome = await handlePaymentEvent(payoutEvent('po4', 500), providerAccount);

    expect(outcome).toMatchObject({ status: 'error' });
    expect(await transferRows()).toEqual([]);
  });

  it('aktarımdan önce düşen banka satırı, aktarım yazılınca ona kendiliğinden bağlanır — para bankada bir kez sayılır', async () => {
    await settings.override('card_payout_account_id', bankAccount);
    const [statement] = await movements.insertImported([
      {
        accountId: bankAccount,
        direction: 'in',
        amountCents: 2500,
        type: 'misc',
        description: 'REVOLUT PAYOUT',
        valueDate: dayOffset(0),
        source: 'bank_import',
        reconciled: false,
        importFingerprint: `test:${stamp}:payout`,
      },
    ]);
    const event: PaymentEvent = {
      key: `PAYOUT_COMPLETED:${stamp}_po5`,
      kind: 'payout_completed',
      payout: { id: `po_${stamp}_once`, amountCents: 2500, currency: 'EUR', valueDate: dayOffset(0) },
    };

    expect(await handlePaymentEvent(event, providerAccount)).toMatchObject({ status: 'ok', action: 'payout_recorded' });

    const [transfer] = await transferRows();
    expect(await movements.getById(statement!.id)).toMatchObject({
      type: 'transfer',
      counterpartMovementId: transfer!.id,
      reconciled: true,
    });
    expect(await movements.listTransferLegsAwaiting(bankAccount)).toEqual([]);
  });
});
