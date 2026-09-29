import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as StripeModule from '../../lib/stripe';

/*
  Kart taslağının mobil uçtaki yolu: ödeme açılınca kalemler sepetten çıkar, Stripe'ın mesajı gelmese de okumalar sonucu netleştirir.
  Yalnız Stripe (gerçeği `odenen` kümesi) ve mail gönderimi sahte; uç, oturum, sepet, bildirim zinciri ve veritabanı gerçek.
*/
const odenen = new Set<string>();
const niyetSiparisi = new Map<string, string>();
const niyetAnahtari = new Map<string, string>();
let n = 0;
vi.mock('../../lib/stripe', async (orig) => ({
  ...(await orig<typeof StripeModule>()),
  paymentSessionCreator: () => async ({ orderId, amountCents }: { orderId: string; amountCents: number }) => {
    const id = `pi_acik_${Date.now()}_${++n}_${amountCents}`;
    niyetSiparisi.set(id, orderId);
    niyetAnahtari.set(id, `secret_${n}`);
    return { id, clientSecret: `secret_${n}` };
  },
  paymentGateway: () => ({
    read: async (id: string) => ({
      id,
      status: odenen.has(id) ? 'succeeded' : 'requires_payment_method',
      amountReceivedCents: odenen.has(id) ? Number(id.split('_').at(-1)) : 0,
      orderId: niyetSiparisi.get(id) ?? null,
      clientSecret: niyetAnahtari.get(id) ?? null,
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
/* Teslim günü sunucunun listesinden alınır: kesim saati geçince en erken gün kayar ve sabit "yarın" akşamları reddedilirdi. */
let gun = '';

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
  await new CartService(db).replace(musteriId, [{ variantId, qty: 1, stockId: null, unitPrice: 60 }]);
  const snapshot = (await (await istek(`/checkout?addressId=${addressId}`)).json()) as { data: { delivery: { availableDates: string[] } } };
  gun = snapshot.data.delivery.availableDates[0]!;
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
  return ((await res.json()) as { data: { status: string; orderId: string; clientSecret?: string } }).data;
};
const stripeteOde = async (orderId: string) => {
  const order = await new OrderService(db).getById(orderId);
  odenen.add(order!.paymentRef!);
};

describe('kart ödemesi açılınca', () => {
  // Uç sepeti sunucudan okumazsa ya da kapı kalemleri sepetten almazsa aynı kalemler için ikinci sipariş açılır.
  it('kalemler sepetten çıkar; yeni anahtarla ikinci basış boş sepetle sipariş açmaz', async () => {
    const ilk = await kartlaSiparis(`acik-1-${stamp}`);

    expect(ilk.status).toBe('payment_required');
    expect((await new CartService(db).get(musteriId)).items).toHaveLength(0);
    expect((await kartlaSiparis(`acik-2-${stamp}`)).status).toBe('empty_cart');
  });

  // Anahtar gövdeden kapıya geçmezse çift dokunuş ikinci taslak ve ikinci ödeme açar.
  it('aynı anahtarla ikinci basış aynı siparişin aynı ödemesine döner', async () => {
    const ilk = await kartlaSiparis(`acik-3-${stamp}`);
    const ikinci = await kartlaSiparis(`acik-3-${stamp}`);

    expect(ikinci).toMatchObject({ status: 'payment_required', orderId: ilk.orderId, clientSecret: ilk.clientSecret });
  });

  // Liste okuması ödemeyi netleştirmezse Stripe'ın mesajı gelmeyen ödenmiş sipariş pencere kapanana dek "bekliyor" görünür.
  it('sipariş listesi okuması Stripe mesajı gelmeden ödenmiş siparişi onaylar', async () => {
    const ilk = await kartlaSiparis(`acik-4-${stamp}`);
    await stripeteOde(ilk.orderId);

    expect((await istek('/orders')).status).toBe(200);
    expect((await new OrderService(db).getById(ilk.orderId))?.status).toBe('confirmed');
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

  it('ödeme tamamlanmadıysa taslak kalır; ekran "tamamlanmadı", son saati ve özeti okur', async () => {
    const ilk = await kartlaSiparis(`durum-2-${stamp}`);

    const res = await istek(`/checkout/order/${ilk.orderId}/status`);

    const { data } = (await res.json()) as { data: { payBy: string | null } };
    // Özet siparişin kendisinden gelir; tutar ortamın kampanyasına bağlı olduğu için sabit yazılmaz.
    const order = await new OrderService(db).getById(ilk.orderId);
    expect(data).toMatchObject({
      placed: false,
      awaitingCard: true,
      paymentState: 'incomplete',
      referenceNo: null,
      totalCents: order?.orderedTotalCents,
      deliveryType: order?.deliveryType,
    });
    expect(data.payBy).not.toBeNull();
  });

  it('ödeme penceresi kapanmış ve ödeme yoksa taslak iptal edilir, kalemler sepete döner, "siparişiniz oluşmadı" maili gider', async () => {
    const ilk = await kartlaSiparis(`durum-4-${stamp}`);
    await new ReservationService(db).releaseByOrder(ilk.orderId);
    gidenMail.length = 0;

    const res = await istek(`/checkout/order/${ilk.orderId}/status`);

    expect(((await res.json()) as { data: unknown }).data).toMatchObject({ cancelled: true, refunded: false, referenceNo: null });
    expect(gidenMail).toEqual(['Ödemeniz tamamlanmadı — siparişiniz oluşmadı']);
    expect((await new CartService(db).get(musteriId)).items.map((row) => row.variantId)).toEqual([variantId]);
  });

  it('başkasının siparişi bulunamayan gibi 404', async () => {
    const ilk = await kartlaSiparis(`durum-3-${stamp}`);

    expect((await istek(`/checkout/order/${ilk.orderId}/status`, {}, yabanciToken)).status).toBe(404);
    expect((await istek('/checkout/order/abc/status')).status).toBe(404);
  });
});

describe('ödemesi bekleyen sipariş', () => {
  // Liste satırı kimliksiz gelseydi native ödeme ekranını açamaz, müşteri kalemleri sepetten çıkmış siparişini bulamazdı.
  it('siparişler listesinde numarasız, kimlikli "ödeme bekleniyor" satırıdır', async () => {
    const ilk = await kartlaSiparis(`liste-${stamp}`);

    const { data } = (await (await istek('/orders')).json()) as { data: { orders: unknown[] } };

    expect(data.orders).toEqual([expect.objectContaining({ status: 'awaiting_payment', reference: null, orderId: ilk.orderId })]);
  });

  // Dönüş başka anahtar verseydi aynı sipariş için ikinci ödeme açılırdı.
  it('ödemeye dönüş aynı ödemenin anahtarını verir; başkasının siparişi bulunamaz', async () => {
    const ilk = await kartlaSiparis(`donus-${stamp}`);

    expect((await istek(`/checkout/order/${ilk.orderId}/resume`, { method: 'POST' }, yabanciToken)).status).toBe(404);
    const res = await istek(`/checkout/order/${ilk.orderId}/resume`, { method: 'POST' });
    expect(((await res.json()) as { data: unknown }).data).toEqual({
      status: 'payment_required',
      orderId: ilk.orderId,
      clientSecret: ilk.clientSecret,
    });
  });

  // İptal kalemleri sepete döndürmeseydi vazgeçen müşterinin ürünleri kaybolurdu.
  it('iptal ödemeyi ve siparişi kapatır, kalemler sepete döner', async () => {
    const ilk = await kartlaSiparis(`iptal-${stamp}`);

    expect((await istek(`/checkout/order/${ilk.orderId}/cancel`, { method: 'POST' }, yabanciToken)).status).toBe(404);
    const res = await istek(`/checkout/order/${ilk.orderId}/cancel`, { method: 'POST' });

    expect(((await res.json()) as { data: unknown }).data).toEqual({ status: 'cancelled' });
    expect(await new OrderService(db).getById(ilk.orderId)).toMatchObject({ status: 'cancelled', cancelReason: 'customer' });
    expect((await new CartService(db).get(musteriId)).items.map((row) => row.variantId)).toEqual([variantId]);
  });
});
