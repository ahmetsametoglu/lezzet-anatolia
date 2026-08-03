import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, OrderService, ProductService, ReservationService, StockService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse } from '@lezzet/database/testing';
import { recordOrderPayment } from '../money/order-payment';
import { buildOrderNotification } from './notification-data';
import { notifyOrderStatus } from './notify';
import { cancelOrder } from './refund';
import { transitionOrder } from './transition';

/**
 * Sipariş bildirimleri (14.5). Doğrulanan üç şey: **veri siparişten doğru türüyor mu** (dil, kalem
 * adı, tutar), **eksik karşılanma müşteriye görünüyor mu**, ve **geçiş başına tek haber** kuralı.
 *
 * Gönderimin kendisi burada test edilmez (o `packages/notify`'ın birim testi); burada test edilen
 * şey maile giren VERİDİR — yanlış sayı gönderilen mailde geri alınamaz.
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
let batchId: string;
let cashAccount: string;
const createdProfiles: string[] = [];

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `Bildirim testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Fıstıklı Baklava ${stamp}`, fr: `Baklava pistache ${stamp}`, de: `Baklava Pistazie ${stamp}` },
    categoryId: category.id,
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  const profile = await new UserProfileService(db).insert({
    name: 'Ayşe',
    email: `ayse-${stamp}@example.test`,
    preferredLanguage: 'fr',
  });
  customerId = profile.id;
  createdProfiles.push(profile.id);
  cashAccount = (await new AccountService(db).insert({ name: `Bildirim kasası ${stamp}`, type: 'cash' })).id;
});

beforeEach(async () => {
  await db.from('money_movement').delete().eq('account_id', cashAccount);
  await db.from('order').delete().eq('customer_id', customerId);
  await db.from('reservation').delete().eq('variant_id', variantId);
  await db.from('stock').delete().eq('variant_id', variantId);
  batchId = (await stocks.insert({ warehouseId, variantId, physicalQty: 20, expiryDate: dayOffset(30), purchasePriceCents: 400 })).id;
});

afterAll(async () => {
  await db.from('money_movement').delete().eq('account_id', cashAccount);
  await db.from('order').delete().eq('customer_id', customerId);
  await db.from('account').delete().eq('id', cashAccount);
  // Rezervasyonun siparişe FK'sı YOKTUR (0007) — sipariş silinince kendiliğinden gitmez. Kalan
  // satır TTL süpürme testini yanıltır: o test genel sayı üzerinden çalışır.
  await db.from('reservation').delete().eq('variant_id', variantId);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: createdProfiles });
  await db.from('warehouse').delete().eq('id', warehouseId);
});

/** Sipariş aç → ayır → onayla. Bildirim için yeterli en kısa yol. */
async function confirmOrder(qty: number, extra: { shippingFeeCents?: number; discountAmountCents?: number } = {}) {
  const shippingFeeCents = extra.shippingFeeCents ?? 0;
  const discountAmountCents = extra.discountAmountCents ?? 0;
  const { order, items } = await orders.create(
    {
      warehouseId, customerId, channel: 'b2c', deliveryType: 'route',
      shippingFeeCents,
      discountAmountCents,
      totalCents: qty * 1000 + shippingFeeCents - discountAmountCents,
    },
    // İndirim KALEME de dağıtılır: `discount_amount = Σ line_discount_amount` artık veritabanının
    // zorladığı bir değişmez (0041). Tek kalemli fikstürde payın tamamı o kaleme iner.
    [{ variantId, qty, unitPriceCents: 1000, vatRate: 5.5, lineDiscountAmountCents: discountAmountCents }],
  );
  await reservations.reserve({ orderId: order.id, warehouseId, variantId, qty });
  await transitionOrder({ orderId: order.id, to: 'confirmed' });
  return { orderId: order.id, itemId: items[0]!.id };
}

describe('bildirim verisi siparişten türer', () => {
  it('dil MÜŞTERİDEN gelir, kalem adı üründen', async () => {
    const { orderId } = await confirmOrder(2);

    const bundle = await buildOrderNotification(orderId, 'order_confirmed');

    expect(bundle?.data.locale).toBe('fr'); // profildeki tercih — operasyon Türkçe olsa da müşteri Fransızca
    expect(bundle?.recipient.email).toContain('@example.test');
    expect(bundle?.data.lines[0]?.name).toContain('Baklava pistache');
    expect(bundle?.data.customerName).toBe('Ayşe');
  });

  it('tutar dökümü yalnız ONAY mailinde açılır, sonraki maillerde tek satır kalır', async () => {
    const { orderId } = await confirmOrder(3, { shippingFeeCents: 500, discountAmountCents: 1000 });

    const confirmed = await buildOrderNotification(orderId, 'order_confirmed');
    const shipped = await buildOrderNotification(orderId, 'order_out_for_delivery');

    expect(confirmed?.data.totals.map((total) => total.label)).toEqual(['Sous-total', 'Remise', 'Livraison']);
    expect(shipped?.data.totals).toHaveLength(0); // "ne geliyor" sorusunun cevabı döküm değil
    expect(confirmed?.data.grandTotal?.value).toContain('25'); // 3×10 + 5 kargo − 10 indirim
  });

  it('eksik karşılanan kalem müşteriye SEBEPSİZ ama rakamlı görünür (tasarım kuralı)', async () => {
    const { orderId, itemId } = await confirmOrder(5);
    // Depo 5 istenenden 4'ünü hazırlayabildi — eksik hazırlıkta doğar (DOMAIN §8).
    // Sipariş `preparing`'de olmalı: karşılanan adet ancak hazırlık kaydı yazıldığında bir karardır
    // (`isFulfillmentSettled`), onaylanmış siparişte 0 olması "eksik gitti" demek değildir.
    await transitionOrder({ orderId, to: 'preparing' });
    await orders.recordPreparation(orderId, [{ orderItemId: itemId, batches: [{ stockId: batchId, qty: 4 }] }]);

    const bundle = await buildOrderNotification(orderId, 'order_out_for_delivery');

    const line = bundle?.data.lines[0];
    expect(line?.shortfall).toContain('5 commandés, 4 expédiés');
    expect(line?.shortfall).toContain('remboursés');
    expect(line?.qty).toBe(4);
    // Güncel toplam karşılanandan TÜRER: eksik çıkan kalem tutarı kendiliğinden iner.
    expect(bundle?.data.grandTotal?.value).toContain('40');
  });

  it('zaman çizgisi durum LOGUNDAN türer — ayrı damga kolonu yok', async () => {
    const { orderId } = await confirmOrder(1);
    for (const status of ['preparing', 'ready', 'out_for_delivery'] as const) {
      await transitionOrder({ orderId, to: status });
    }

    const bundle = await buildOrderNotification(orderId, 'order_out_for_delivery');

    const steps = bundle?.data.steps ?? [];
    expect(steps.map((step) => step.state)).toEqual(['done', 'done', 'current', 'pending']);
    expect(steps[0]?.detail).toBeTruthy(); // "alındı" damgası logdan geldi
    expect(steps[3]?.detail).toBeNull();
  });
});

describe('istisna bildirimleri — zaman çizgisi yok, para çözümü var', () => {
  it('iptalde tahsil edilenin TAMAMI iade tutarı olarak yazılır', async () => {
    const { orderId } = await confirmOrder(3);
    await recordOrderPayment({ orderId, accountId: cashAccount, amountCents: 3000 });
    await cancelOrder(orderId);

    // İade yazıldıktan SONRA kurulur: borç sıfırlanmıştır, tutar kapıdan gelir.
    const bundle = await buildOrderNotification(orderId, 'order_cancelled', { refundedAmountCents: 3000 });

    expect(bundle?.data.steps).toHaveLength(0); // istisna bildiriminde çizgi yok
    expect(bundle?.data.statusAt).toBeTruthy();
    expect(bundle?.data.refund?.amount).toContain('30');
    expect(bundle?.data.refund?.currentTotal).toBeNull(); // iptalde güncellenecek toplam yok
  });

  it('tahsilat yapılmamış iptalde iade kartı HİÇ çıkmaz', async () => {
    const { orderId } = await confirmOrder(2);
    await cancelOrder(orderId);

    const bundle = await buildOrderNotification(orderId, 'order_cancelled', { refundedAmountCents: 0 });

    expect(bundle?.data.refund).toBeNull(); // "0,00 € iade edildi" diyen mail gürültüdür
  });

  it('eksik karşılanmada tutar GİTMEYEN MALIN değeridir — ödeme yöntemine bakmaz', async () => {
    const { orderId, itemId } = await confirmOrder(5);
    await orders.recordPreparation(orderId, [{ orderItemId: itemId, batches: [{ stockId: batchId, qty: 4 }] }]);

    // Kapıda ödenecek sipariş: hiç tahsilat yok, yine de fark gösterilmeli.
    const bundle = await buildOrderNotification(orderId, 'order_shortfall');

    expect(bundle?.data.refund?.amount).toContain('10'); // 1 adet × 10 €
    expect(bundle?.data.refund?.currentTotal).toContain('40');
    expect(bundle?.data.paidOnline).toBe(false);
  });

  it('peşin ödenmiş eksik karşılanmada aynı tutar iade tarafına düşer', async () => {
    const { orderId, itemId } = await confirmOrder(5);
    await recordOrderPayment({ orderId, accountId: cashAccount, amountCents: 5000 });
    await orders.recordPreparation(orderId, [{ orderItemId: itemId, batches: [{ stockId: batchId, qty: 4 }] }]);

    const bundle = await buildOrderNotification(orderId, 'order_shortfall');

    expect(bundle?.data.refund?.amount).toContain('10');
    expect(bundle?.data.paidOnline).toBe(true); // dipnot "karta iade" yönüne döner
  });
});

describe('geçiş başına tek haber', () => {
  it('aynı duruma İKİNCİ giriş haber üretmez', async () => {
    const { orderId } = await confirmOrder(1);
    for (const status of ['preparing', 'ready', 'out_for_delivery'] as const) {
      await transitionOrder({ orderId, to: status });
    }

    // Kapıdan dönüş: yola çıkma ikinci kez yaşanır — müşteri aynı haberi tekrar almamalı.
    await transitionOrder({ orderId, to: 'ready' });
    await transitionOrder({ orderId, to: 'out_for_delivery' });

    const second = await notifyOrderStatus(orderId, 'out_for_delivery');
    expect(second[0]).toMatchObject({ status: 'skipped', reason: 'already_notified' });
  });

  it('bildirimi olmayan geçiş sessizdir', async () => {
    const { orderId } = await confirmOrder(1);

    expect(await notifyOrderStatus(orderId, 'preparing')).toEqual([]);
  });
});
