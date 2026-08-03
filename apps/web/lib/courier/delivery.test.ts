import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, OrderItemBatchService, OrderService, ProductService, ReservationService,
  StockService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData, settingsSnapshot, createTestWarehouse } from '@lezzet/database/testing';
import { confirmDoorDelivery, type DeliveryProofInput, type DoorCollectionInput } from './delivery';
import { transitionOrder } from '../order/transition';

/**
 * Kapıda teslim, eksik kalem ve tahsilat (11.2/11.3).
 *
 * Üç kritik doğrulama: **B2B imzasız kapanmıyor mu**, **eksik işareti tutarı kendiliğinden
 * düşürüyor mu** (kurye hesap yapmaz) ve **nakit sınır uyarısı engel değil mi**.
 */
const db = serviceDb();
const orders = new OrderService(db);
const itemBatches = new OrderItemBatchService(db);
const stocks = new StockService(db);
const reservations = new ReservationService(db);

const stamp = Date.now();
let customerId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
let b2bCustomerId: string;
let courierId: string;
let variantId: string;
let productId: string;
let categoryId: string;
let stockId: string;
let accountId: string;
const createdProfiles: string[] = [];

const today = new Date().toISOString().slice(0, 10);
const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `Kapı testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Sucuk ${stamp}` },
    categoryId: category.id,
    variants: [{ label: { tr: '400 g' } }],
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;

  const profiles = new UserProfileService(db);
  const customer = await profiles.insert({ name: 'Luc Martin', email: `kapi-${stamp}@example.test` });
  const b2b = await profiles.insert({ name: 'Restaurant Anadolu', email: `b2b-${stamp}@example.test`, type: 'company' });
  const courier = await profiles.insert({ name: 'Kurye Ece', email: `ece-${stamp}@example.test` });
  customerId = customer.id;
  b2bCustomerId = b2b.id;
  courierId = courier.id;
  createdProfiles.push(customer.id, b2b.id, courier.id);

  accountId = (await new AccountService(db).insert({ name: `Kurye kasası ${stamp}`, type: 'cash' })).id;
});

beforeEach(async () => {
  for (const id of [customerId, b2bCustomerId]) await db.from('order').delete().eq('customer_id', id);
  await db.from('reservation').delete().eq('variant_id', variantId);
  await db.from('stock').delete().eq('variant_id', variantId);
  stockId = (await stocks.insert({ warehouseId, variantId, physicalQty: 30, expiryDate: dayOffset(60), purchasePriceCents: 400 })).id;
});

afterAll(async () => {
  for (const id of [customerId, b2bCustomerId]) await db.from('order').delete().eq('customer_id', id);
  await db.from('reservation').delete().eq('variant_id', variantId);
  await db.from('account').delete().eq('id', accountId);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: createdProfiles });
  await db.from('warehouse').delete().eq('id', warehouseId);
});

/** Kapıya varmış sipariş: hazırlanmış, partisi yazılmış, yola çıkmış. */
async function atTheDoor(opts: { channel?: 'b2b' | 'b2c'; qty?: number; unitPriceCents?: number } = {}) {
  const qty = opts.qty ?? 4;
  const unitPriceCents = opts.unitPriceCents ?? 1000;
  const channel = opts.channel ?? 'b2c';
  const { order, items } = await orders.create(
    {
      warehouseId,
      customerId: channel === 'b2b' ? b2bCustomerId : customerId,
      channel,
      deliveryType: 'route',
      deliveryDate: today,
      courierId,
      paymentMethod: 'cash',
      totalCents: qty * unitPriceCents,
    },
    [{ variantId, qty, unitPriceCents, vatRate: 5.5 }],
  );
  await reservations.reserve({ orderId: order.id, warehouseId, variantId, qty });
  for (const status of ['confirmed', 'preparing'] as const) await transitionOrder({ orderId: order.id, to: status });
  await orders.recordPreparation(order.id, [{ orderItemId: items[0]!.id, batches: [{ stockId, qty }] }]);
  for (const status of ['ready', 'out_for_delivery'] as const) await transitionOrder({ orderId: order.id, to: status });
  return { orderId: order.id, itemId: items[0]!.id };
}

describe('teslim onayı (11.2)', () => {
  it('B2B teslimatı imzasız KAPANMAZ ve hiçbir yazım yapılmaz', async () => {
    const { orderId } = await atTheDoor({ channel: 'b2b' });

    const outcome = await confirmDoorDelivery({ orderId, courierId });

    expect(outcome).toEqual({ status: 'proof_required', channel: 'b2b' });
    // Kanıt kapısı yazımdan ÖNCE: sipariş hâlâ yolda, stok el değmemiş.
    expect((await orders.getById(orderId))?.status).toBe('out_for_delivery');
    expect((await stocks.getAvailable(warehouseId, variantId)).physicalQty).toBe(30);
  });

  it('imzayla B2B teslimatı kapanır, kanıt siparişe yazılır', async () => {
    const { orderId } = await atTheDoor({ channel: 'b2b' });
    // Ekranın göndereceği şekiller — kanıt görsel anahtarı taşır, tahsilat üç yöntemle sınırlıdır.
    const proof: DeliveryProofInput = { kind: 'signature', imageKey: 'proofs/abc.png', receivedBy: 'Şef Murat' };
    const collection: DoorCollectionInput = { method: 'cash', amount: 40, accountId };

    const outcome = await confirmDoorDelivery({ orderId, courierId, proof, collection });

    expect(outcome.status).toBe('ok');
    const order = await orders.getById(orderId);
    expect(order?.status).toBe('delivered');
    expect(order?.deliveryProof).toMatchObject({ kind: 'signature', receivedBy: 'Şef Murat', courierId });
  });

  it('B2C kanıtsız teslim edilebilir — kapsam parametrik, varsayılan kapalı', async () => {
    const { orderId } = await atTheDoor();

    expect((await confirmDoorDelivery({ orderId, courierId })).status).toBe('ok');
    expect((await orders.getById(orderId))?.status).toBe('delivered');
  });

  it('başka kuryenin siparişi bu ekrandan teslim edilemez', async () => {
    const { orderId } = await atTheDoor();
    await orders.update({ id: orderId, courierId: null });

    expect(await confirmDoorDelivery({ orderId, courierId })).toEqual({ status: 'forbidden', reason: 'not_assigned' });
  });
});

describe('eksik/reddedilen kalem (11.2)', () => {
  it('eksik işareti tutarı KENDİLİĞİNDEN düşürür — kurye hesap yapmaz', async () => {
    const { orderId, itemId } = await atTheDoor({ qty: 4 }); // 40 €

    // Müşteri 1 adedi kabul etmedi → 3 adet teslim.
    const outcome = await confirmDoorDelivery({
      orderId, courierId,
      adjustments: [{ orderItemId: itemId, fulfilledQty: 3 }],
      collection: { method: 'cash', amount: 30, accountId },
    });

    expect(outcome).toMatchObject({ status: 'ok', collected: 30, amountDue: 0, paymentStatus: 'paid' });
    // Reddedilen adet HİÇ çıkmadı: fiiliden yalnız 3 düştü, 1 adet depoda kaldı.
    expect((await stocks.getAvailable(warehouseId, variantId)).physicalQty).toBe(27);
  });

  it('kalem düzeltmesi teslimden ÖNCE yazılır — mal iki kez oynatılmaz', async () => {
    const { orderId, itemId } = await atTheDoor({ qty: 4 });

    await confirmDoorDelivery({
      orderId, courierId,
      adjustments: [{ orderItemId: itemId, fulfilledQty: 2 }],
      collection: { method: 'cash', amount: 20, accountId },
    });

    // Kalem–parti kaydı 2'ye inmiş olmalı: teslimde bundan düşülür (0026 "tam bir kez say").
    const batches = await itemBatches.listByOrder(orderId);
    expect(batches.reduce((sum, batch) => sum + batch.qty, 0)).toBe(2);
    expect((await stocks.getAvailable(warehouseId, variantId)).physicalQty).toBe(28);
  });
});

describe('tahsilat ve nakit sınırı (11.3)', () => {
  it('nakit yasal sınır aşımında UYARI çıkar ama tahsilat tamamlanır', async () => {
    const { orderId } = await atTheDoor({ qty: 4, unitPriceCents: 50_000 }); // 2.000 € — sınır 1.000 €

    const outcome = await confirmDoorDelivery({
      orderId, courierId,
      collection: { method: 'cash', amount: 2_000, accountId },
    });

    expect(outcome).toMatchObject({ status: 'ok', cashLimitExceeded: true, collected: 2_000, paymentStatus: 'paid' });
    expect((await orders.getById(orderId))?.status).toBe('delivered'); // engellenmedi
  });

  it('aynı tutar KARTLA alınırsa uyarı yok — sınır yalnız nakde ait', async () => {
    const { orderId } = await atTheDoor({ qty: 4, unitPriceCents: 50_000 });

    const outcome = await confirmDoorDelivery({
      orderId, courierId,
      collection: { method: 'card', amount: 2_000, accountId },
    });

    expect(outcome).toMatchObject({ status: 'ok', cashLimitExceeded: false });
    // Yöntem siparişe yazılır: gün kapanışı beklenen toplamları bundan türetir (11.6).
    expect((await orders.getById(orderId))?.paymentMethod).toBe('card');
  });

  it('sınır ayardan gelir — kodda sabit yok', async () => {
    const settings = settingsSnapshot(db);
    await settings.override('cash_legal_limit_cents', 1_000); // 10 €
    const { orderId } = await atTheDoor({ qty: 4 });

    try {
      const outcome = await confirmDoorDelivery({
        orderId, courierId,
        collection: { method: 'cash', amount: 40, accountId },
      });
      expect(outcome).toMatchObject({ cashLimitExceeded: true });
    } finally {
      await settings.restore();
    }
  });

  it('tahsilatsız teslim: kalan borç görünür kalır', async () => {
    const { orderId } = await atTheDoor({ qty: 4 });

    const outcome = await confirmDoorDelivery({ orderId, courierId });

    expect(outcome).toMatchObject({ status: 'ok', collected: 0, amountDue: 40, paymentStatus: 'pending' });
  });
});
