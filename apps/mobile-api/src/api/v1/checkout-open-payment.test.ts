import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as StripeModule from '../../lib/stripe';

/*
  Stripe'ın mesajı gelmediği hâl: ödeme Stripe'ta geçti ama sipariş hâlâ taslak. Stripe yalnız bu dosyada sahte; uç, oturum,
  sepet ve veritabanı gerçek. Stripe'ın "gerçeği" `odenen` kümesidir.
*/
const odenen = new Set<string>();
const niyetSiparisi = new Map<string, string>();
let n = 0;
vi.mock('../../lib/stripe', async (orig) => ({
  ...(await orig<typeof StripeModule>()),
  paymentSessionCreator: () => async ({ orderId, amountCents }: { orderId: string; amountCents: number }) => {
    const id = `pi_acik_${Date.now()}_${++n}_${amountCents}`;
    niyetSiparisi.set(id, orderId);
    return { id, clientSecret: `secret_${n}` };
  },
  paymentGateway: () => ({
    read: async (id: string) => ({
      id,
      status: odenen.has(id) ? 'succeeded' : 'requires_payment_method',
      amountReceivedCents: odenen.has(id) ? Number(id.split('_').at(-1)) : 0,
      orderId: niyetSiparisi.get(id) ?? null,
    }),
    cancel: async () => undefined,
    refund: async () => undefined,
  }),
}));

import { AddressService, CartService, CategoryService, DeliveryZoneService, OrderService, PriceService, ProductService, StockService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, mustDelete, purgeTestData, testPostalCode } from '@lezzet/database/testing';
import { app } from '../../app';
import { createSignedInUser } from '../../lib/testing';

const db = serviceDb();
const stamp = Date.now();
const kod = testPostalCode();
const authUserIds: string[] = [];
const profileIds: string[] = [];
let warehouseId = '';
let categoryId = '';
let productId = '';
let variantId = '';
let zoneId = '';
let musteriId = '';
let token = '';
let addressId = '';
const gun = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'ACK' })).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Açık ödeme ${stamp}` } })).id;
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Açık ödeme böreği ${stamp}` }, categoryId, variants: [{ label: { tr: '1 kg' } }] });
  productId = product.id;
  variantId = variants[0]!.id;
  await new PriceService(db).setPrice({ variantId, channel: 'b2c', amountCents: 6000 });
  await new StockService(db).insert({ warehouseId, variantId, physicalQty: 100, expiryDate: '2027-06-01', purchasePriceCents: 400 });
  const zones = new DeliveryZoneService(db);
  zoneId = (await zones.insert({ name: `Açık ödeme rotası ${stamp}`, warehouseId, weekdays: [1, 2, 3, 4, 5, 6, 7] })).id;
  await zones.replacePostalCodes(zoneId, [{ country: 'FR', postalCode: kod }]);
  const musteri = await createSignedInUser({ prefix: 'acik-odeme', label: 'musteri' });
  authUserIds.push(musteri.authUserId);
  profileIds.push(musteri.profileId);
  musteriId = musteri.profileId;
  token = musteri.token;
  addressId = (await new AddressService(db).insert({ customerId: musteriId, recipient: 'Açık Ödeme', phone: '+33600000000', line1: '1 rue du Test', postalCode: kod, city: 'Strasbourg' })).id;
});

beforeEach(async () => {
  await mustDelete(db, 'order', (q) => q.eq('customer_id', musteriId));
  await new CartService(db).replace(musteriId, [{ variantId, qty: 1, stockId: null, unitPrice: 60 }]);
});

afterAll(async () => {
  await mustDelete(db, 'order', (q) => q.eq('customer_id', musteriId));
  await db.from('delivery_zone').delete().eq('id', zoneId);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds, authUserIds, warehouseIds: [warehouseId] });
});

const istek = (path: string, init: RequestInit = {}) =>
  app.request(`/api/v1/me${path}${path.includes('?') ? '&' : '?'}locale=tr`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  });
const kartlaSiparis = async (key: string) => {
  const res = await istek('/checkout/order', { method: 'POST', body: JSON.stringify({ addressId, paymentMethod: 'online', idempotencyKey: key, deliveryDate: gun }) });
  return ((await res.json()) as { data: { status: string; orderId: string; state?: string } }).data;
};
const stripeteOde = async (orderId: string) => {
  const order = await new OrderService(db).getById(orderId);
  odenen.add(order!.paymentRef!);
};

describe('Stripe mesajı gelmeden ödenmiş sipariş', () => {
  it('müşteri yeniden öderse ikinci sipariş açılmaz, önceki sipariş onaylanır', async () => {
    const ilk = await kartlaSiparis(`acik-1-${stamp}`);
    await stripeteOde(ilk.orderId);

    const ikinci = await kartlaSiparis(`acik-2-${stamp}`);

    expect(ikinci).toMatchObject({ status: 'open_payment', state: 'paid', orderId: ilk.orderId });
    const { data } = await db.from('order').select('id, status').eq('customer_id', musteriId);
    expect(data).toEqual([{ id: ilk.orderId, status: 'confirmed' }]);
  });

  it('sepet okuması ödenmiş siparişi onaylar ve kalemleri sepetten düşer', async () => {
    const ilk = await kartlaSiparis(`acik-3-${stamp}`);
    await stripeteOde(ilk.orderId);

    const res = await istek('/cart');

    expect(res.status).toBe(200);
    expect((await new OrderService(db).getById(ilk.orderId))?.status).toBe('confirmed');
    expect((await new CartService(db).get(musteriId)).items).toHaveLength(0);
  });
});
