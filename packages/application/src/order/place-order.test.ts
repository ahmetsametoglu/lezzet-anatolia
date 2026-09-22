import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AddressService, CategoryService, DeliveryZoneService, PriceService, ProductService, StockService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, mustDelete, purgeTestData, purgeVariantStock, testPostalCode } from '@lezzet/database/testing';
import type { PaymentMethod } from '@lezzet/types';
import { placeOrder } from './place-order';
import { readDeliveryInputs, resolveDelivery } from './delivery';

/**
 * Tekrar anahtarı: native checkout ekranı anahtarı ekran açıkken korur, kart ödemesinden vazgeçen müşteri aynı anahtarla
 * yeniden dener. Yerine geçilen taslağın anahtarı bu denemeyi engellememeli, kesinleşmiş sipariş ise tekrar isteğe aynı cevabı vermeli.
 */
const db = serviceDb();
const stamp = Date.now();
const kod = testPostalCode();
let warehouseId = '';
let categoryId = '';
let productId = '';
let variantId = '';
let customerId = '';
let addressId = '';
let zoneId = '';
let gun = '';

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Tekrar anahtarı ${stamp}` } })).id;
  const urun = await new ProductService(db).create({
    name: { tr: `Anahtar böreği ${stamp}` }, categoryId, vatRate: 5.5, variants: [{ label: { tr: '1 kg' }, sku: `ANH-${stamp}` }],
  });
  productId = urun.product.id;
  variantId = urun.variants[0]!.id;
  await new PriceService(db).setPrice({ variantId, channel: 'b2c', amountCents: 6000 });
  await new StockService(db).insert({ warehouseId, variantId, physicalQty: 50, expiryDate: '2027-06-01', purchasePriceCents: 800 });
  customerId = (await new UserProfileService(db).insert({ name: `Anahtar müşterisi ${stamp}`, phone: `+3363333${String(stamp).slice(-4)}` })).id;
  const zones = new DeliveryZoneService(db);
  zoneId = (await zones.insert({ name: `Anahtar rotası ${stamp}`, warehouseId, weekdays: [1, 2, 3, 4, 5, 6, 7] })).id;
  await zones.replacePostalCodes(zoneId, [{ country: 'FR', postalCode: kod }]);
  addressId = (await new AddressService(db).addForCustomer({
    customerId, recipient: 'Anahtar Alıcı', phone: '+33612345678', line1: '1 rue du Test', postalCode: kod, city: 'Strasbourg',
  })).id;
  const inputs = await readDeliveryInputs(db);
  gun = (await resolveDelivery(db, { postalCode: kod, country: 'FR', inputs })).availableDates[0]!;
});

beforeEach(async () => {
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
});

afterAll(async () => {
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  await purgeVariantStock(db, [variantId]);
  await db.from('address').delete().eq('customer_id', customerId);
  await db.from('delivery_zone').delete().eq('id', zoneId);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: [customerId], warehouseIds: [warehouseId] });
});

let oturum = 0;
const siparis = (paymentMethod: PaymentMethod, idempotencyKey: string) =>
  placeOrder(db, {
    locale: 'fr', customerId, entries: [{ kind: 'variant', variantId, qty: 1, stockId: null }], addressId, deliveryDate: gun,
    paymentMethod, idempotencyKey,
    createPaymentSession: async () => ({ id: `pi_anahtar_${stamp}_${++oturum}`, clientSecret: `secret_${oturum}` }),
  });

describe('tekrar anahtarı', () => {
  it('kart ödemesinden vazgeçen müşteri aynı anahtarla yeniden deneyebilir', async () => {
    const anahtar = `vazgecti-${stamp}`;
    const ilk = await siparis('online', anahtar);
    const ikinci = await siparis('online', anahtar);

    expect(ilk.status).toBe('payment_required');
    expect(ikinci.status).toBe('payment_required');
    const { data } = await db.from('order').select('id, status').eq('idempotency_key', anahtar);
    expect(data?.find((o) => o.id === (ilk as { orderId: string }).orderId)?.status).toBe('cancelled');
    expect(data?.find((o) => o.id === (ikinci as { orderId: string }).orderId)?.status).toBe('draft');
  });

  it('kesinleşmiş sipariş, iptal edilmiş taslakla aynı anahtarı paylaşsa da tekrar isteğe aynı siparişi döndürür', async () => {
    const anahtar = `kesinlesti-${stamp}`;
    await siparis('online', anahtar);
    const kapida = await siparis('cash', anahtar);
    const tekrar = await siparis('cash', anahtar);

    expect(kapida.status).toBe('placed');
    expect(tekrar).toMatchObject({ status: 'placed', orderId: (kapida as { orderId: string }).orderId });
    const { count } = await db.from('order').select('id', { count: 'exact', head: true }).eq('idempotency_key', anahtar).neq('status', 'cancelled');
    expect(count).toBe(1);
  });
});
