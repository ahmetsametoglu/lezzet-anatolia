import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OrderService, SettingsService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData, settingsSnapshot, createTestWarehouse } from '@lezzet/database/testing';
import { CategoryService, ProductService } from '@lezzet/database';
import { resolveCheckoutPayment } from './checkout-options';

/**
 * Checkout ödeme seçenekleri (07.3) — motor + ayar + müşteri kartı birlikte. "Hangi yöntem açık"
 * kararı motorun birim testinde (`domain-core/payment`); burada **gerçek ayarların ve müşteri
 * kartının okunduğu**, açık bakiyenin siparişlerden TÜRETİLDİĞİ doğrulanır.
 */
const db = serviceDb();
const profiles = new UserProfileService(db);
const orders = new OrderService(db);

const stamp = Date.now();
let customerId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
let creditCustomerId: string;
let variantId: string;
let productId: string;
let categoryId: string;
const createdProfiles: string[] = [];

const LINES = [{ totalCents: 4000, vatRate: 5.5 }];

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `Checkout testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Baklava ${stamp}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;

  const customer = await profiles.insert({ name: `Peşin müşteri ${stamp}` });
  customerId = customer.id;
  const vadeli = await profiles.insert({ name: `Vadeli müşteri ${stamp}`, creditEnabled: true, creditLimitCents: 10000 });
  creditCustomerId = vadeli.id;
  createdProfiles.push(customer.id, vadeli.id);
  SettingsService.invalidate();
});

afterAll(async () => {
  await db.from('order').delete().in('customer_id', createdProfiles);
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    warehouseIds: [warehouseId],
  });
  SettingsService.invalidate();
});

describe('kargo ücreti ve KDV (07.3)', () => {
  it('rota içi teslimat ücretsiz; toplam sepetin kendisidir', async () => {
    const r = await resolveCheckoutPayment({ customerId, deliveryType: 'route', basketCents: 4000, lines: LINES });
    expect(r).toMatchObject({ shippingFeeCents: 0, shippingFreeReason: 'route', orderTotalCents: 4000 });
    expect(r.shippingVat).toEqual([]);
  });

  it('kargoda eşik altı sipariş ücret öder ve ücret toplama eklenir', async () => {
    const r = await resolveCheckoutPayment({ customerId, deliveryType: 'shipping', basketCents: 4000, lines: LINES });
    expect(r.shippingFeeCents).toBe(790); // ayar varsayılanı
    expect(r.orderTotalCents).toBe(4790);
    expect(r.remainingForFreeShippingCents).toBe(2000);
    expect(r.shippingVat).toEqual([{ vatRate: 5.5, amountCents: 790, vatCents: 41 }]);
  });

  it('eşik üstü kargo bedava', async () => {
    const r = await resolveCheckoutPayment({ customerId, deliveryType: 'shipping', basketCents: 8000, lines: [{ totalCents: 8000, vatRate: 5.5 }] });
    expect(r).toMatchObject({ shippingFeeCents: 0, shippingFreeReason: 'threshold' });
  });

  it('ücret ayardan okunur — değiştirince hesap değişir', async () => {
    const settings = settingsSnapshot(db);
    await settings.override('shipping_fee_cents', 1200);
    try {
      const r = await resolveCheckoutPayment({ customerId, deliveryType: 'shipping', basketCents: 4000, lines: LINES });
      expect(r.shippingFeeCents).toBe(1200);
    } finally {
      await settings.restore();
    }
  });
});

describe('ödeme yöntemleri', () => {
  it('rota içi + tavan altı → kapıda ödeme açık', async () => {
    const r = await resolveCheckoutPayment({ customerId, deliveryType: 'route', basketCents: 4000, lines: LINES });
    expect(r.methods).toEqual(['online', 'bank_transfer', 'cash', 'card', 'cheque']);
    expect(r.codBlockedReason).toBeNull();
  });

  it('kargoda kapıda ödeme yok — peşin', async () => {
    const r = await resolveCheckoutPayment({ customerId, deliveryType: 'shipping', basketCents: 4000, lines: LINES });
    expect(r.methods).toEqual(['online', 'bank_transfer']);
    expect(r.codBlockedReason).toBe('shipping');
  });

  it('tavan aşan sipariş kapıda ödemeyi kapatır (ayardan okunur)', async () => {
    const r = await resolveCheckoutPayment({ customerId, deliveryType: 'route', basketCents: 40_000, lines: [{ totalCents: 40_000, vatRate: 5.5 }] });
    expect(r.codBlockedReason).toBe('over_limit');
  });

  it('nakit yasal sınırı UYARIR ama engellemez', async () => {
    const settings = settingsSnapshot(db);
    await settings.override('cod_max_cents', 200_000);
    try {
      const r = await resolveCheckoutPayment({ customerId, deliveryType: 'route', basketCents: 120_000, lines: [{ totalCents: 120_000, vatRate: 5.5 }] });
      expect(r.cashWarning).toBe(true);
      expect(r.methods).toContain('cash');
    } finally {
      await settings.restore();
    }
  });
});

describe('vade freni — açık bakiye TÜRETİLİR', () => {
  it('vade yetkisi olmayan müşteride "hesaba" kapalı', async () => {
    const r = await resolveCheckoutPayment({ customerId, deliveryType: 'route', basketCents: 4000, lines: LINES });
    expect(r).toMatchObject({ creditAvailable: false, creditBlockedReason: 'not_enabled' });
  });

  it('limit içinde vade OTOMATİK açılır', async () => {
    const r = await resolveCheckoutPayment({ customerId: creditCustomerId, deliveryType: 'route', basketCents: 4000, lines: LINES });
    expect(r.creditAvailable).toBe(true);
    expect(r.creditBlockedReason).toBeNull();
  });

  it('ödenmemiş vadeli sipariş açık bakiyeye girer; limit aşımı admin onayına düşer', async () => {
    // 80 € ödenmemiş vadeli sipariş + 40 € yeni sipariş = 120 € > 100 € limit
    await orders.create(
      { warehouseId, customerId: creditCustomerId, channel: 'b2b', onAccount: true, totalCents: 8000 },
      [{ variantId, qty: 1, unitPriceCents: 8000, vatRate: 5.5 }],
    );

    const r = await resolveCheckoutPayment({ customerId: creditCustomerId, deliveryType: 'route', basketCents: 4000, lines: LINES });
    expect(r.creditAvailable).toBe(false);
    expect(r.creditBlockedReason).toBe('limit_exceeded');
    expect(r.creditRequiresApproval).toBe(true); // reddedilmez, admin'e düşer
  });

  it('iptal edilen vadeli sipariş açık bakiyeye SAYILMAZ', async () => {
    const { order } = await orders.create(
      { warehouseId, customerId: creditCustomerId, channel: 'b2b', onAccount: true, totalCents: 50_000, status: 'cancelled' },
      [{ variantId, qty: 1, unitPriceCents: 50_000, vatRate: 5.5 }],
    );
    expect(order.status).toBe('cancelled');

    // Yukarıdaki 80 € hâlâ açık; iptal edilen 500 € eklenmediği için sebep hâlâ limit aşımı,
    // "gecikme" değil ve bakiye patlamış görünmüyor.
    const r = await resolveCheckoutPayment({ customerId: creditCustomerId, deliveryType: 'route', basketCents: 100, lines: [{ totalCents: 100, vatRate: 5.5 }] });
    expect(r.creditAvailable).toBe(true); // 80 + 1 = 81 € < 100 € limit
  });
});

describe('asgari sepet', () => {
  it('asgari yoksa her sepet geçer', async () => {
    const r = await resolveCheckoutPayment({ customerId, deliveryType: 'route', basketCents: 100, lines: [{ totalCents: 100, vatRate: 5.5 }] });
    expect(r.minBasketOk).toBe(true);
  });

  it('asgari konursa eksik tutar bildirilir', async () => {
    const settings = settingsSnapshot(db);
    await settings.override('min_basket_cents', 2500);
    try {
      const r = await resolveCheckoutPayment({ customerId, deliveryType: 'route', basketCents: 1500, lines: [{ totalCents: 1500, vatRate: 5.5 }] });
      expect(r).toMatchObject({ minBasketOk: false, missingForMinBasketCents: 1000 });
    } finally {
      await settings.restore();
    }
  });
});
