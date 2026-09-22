import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as StripeModule from '../../lib/stripe';

/*
  Stripe'ın mesajı gelmediği hâl: ödeme Stripe'ta geçti ama sipariş hâlâ taslak. Stripe ve mail gönderimi yalnız bu dosyada sahte;
  uç, oturum, sepet, bildirim zinciri ve veritabanı gerçek. Stripe'ın "gerçeği" `odenen` kümesidir.
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

/* Bildirim paketi dış modül olarak yüklendiği için mail modülü sahtelenemiyor; gönderim Resend'e giden istekte yakalanır. */
const gidenMail = vi.hoisted(() => {
  process.env.RESEND_API_KEY = 're_test_sahte';
  return [] as string[];
});
const gercekFetch = globalThis.fetch;
vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input);
  if (!url.startsWith('https://api.resend.com')) return gercekFetch(input, init);
  gidenMail.push((JSON.parse(String(init?.body)) as { subject: string }).subject);
  return new Response(JSON.stringify({ id: 'sahte' }), { status: 200, headers: { 'content-type': 'application/json' } });
});

import { AddressService, CartService, CategoryService, DeliveryZoneService, OrderService, PriceService, ProductService, ReservationService, StockService, serviceDb } from '@lezzet/database';
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
let yabanciToken = '';
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
  const yabanci = await createSignedInUser({ prefix: 'acik-odeme', label: 'yabanci' });
  authUserIds.push(yabanci.authUserId);
  profileIds.push(yabanci.profileId);
  yabanciToken = yabanci.token;
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

const istek = (path: string, init: RequestInit = {}, bearer = token) =>
  app.request(`/api/v1/me${path}${path.includes('?') ? '&' : '?'}locale=tr`, {
    ...init,
    headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
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

describe('onay ekranının durum sorusu', () => {
  it('Stripe ödendi diyorsa sipariş o an onaylanır ve numarasıyla döner', async () => {
    const ilk = await kartlaSiparis(`durum-1-${stamp}`);
    await stripeteOde(ilk.orderId);

    const res = await istek(`/checkout/order/${ilk.orderId}/status`);

    const { data } = (await res.json()) as { data: { placed: boolean; referenceNo: string | null; channel: string } };
    expect(data).toMatchObject({ placed: true, channel: `order:${ilk.orderId}` });
    expect(data.referenceNo).not.toBeNull();
    expect((await new OrderService(db).getById(ilk.orderId))?.status).toBe('confirmed');
  });

  it('ödeme tamamlanmadıysa taslak kalır ve ekran "tamamlanmadı" okur', async () => {
    const ilk = await kartlaSiparis(`durum-2-${stamp}`);

    const res = await istek(`/checkout/order/${ilk.orderId}/status`);

    expect(((await res.json()) as { data: unknown }).data).toMatchObject({ placed: false, awaitingCard: true, paymentState: 'incomplete', referenceNo: null });
  });

  it('ödeme penceresi kapanmış ve ödeme yoksa taslak iptal edilir, müşteriye "siparişiniz oluşmadı" maili gider', async () => {
    const ilk = await kartlaSiparis(`durum-4-${stamp}`);
    await new ReservationService(db).releaseByOrder(ilk.orderId);
    gidenMail.length = 0;

    const res = await istek(`/checkout/order/${ilk.orderId}/status`);

    expect(((await res.json()) as { data: unknown }).data).toMatchObject({ cancelled: true, refunded: false, referenceNo: null });
    expect(gidenMail).toEqual(['Ödemeniz tamamlanmadı — siparişiniz oluşmadı']);
  });

  it('başkasının siparişi bulunamayan gibi 404', async () => {
    const ilk = await kartlaSiparis(`durum-3-${stamp}`);

    expect((await istek(`/checkout/order/${ilk.orderId}/status`, {}, yabanciToken)).status).toBe(404);
    expect((await istek('/checkout/order/abc/status')).status).toBe(404);
  });
});
