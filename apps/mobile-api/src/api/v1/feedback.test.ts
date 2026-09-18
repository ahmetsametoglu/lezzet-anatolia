import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CategoryService, FeedbackRequestService, OrderService, ProductService, UserProfileService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, mustDelete, purgeTestData } from '@lezzet/database/testing';
import { feedbackToken } from '@lezzet/domain-core';
// Testin beklediği şekil elle yazılmaz, sözleşmeden gelir: uç bir alanı düşürürse derleme kırılır.
import { FeedbackCompletionSchema, FeedbackInviteSchema, type FeedbackInvite } from '@lezzet/types';
import { app } from '../../app';

/**
 * Geri bildirim uçları uçtan uca, `app.request()` ile port açmadan — akış kuralları `@lezzet/application/feedback`te,
 * burada taşıma sınanır: zarf, durum kodları, adlı retler ve kimlik alanlarını süzen sözleşme.
 * İddialar yalnız bu dosyanın kurduğu satırlara bakar (CLAUDE §4b).
 */
const stamp = Date.now();
const db = serviceDb();
const requests = new FeedbackRequestService(db);

let warehouseId: string;
let categoryId: string;
let productId: string;
let customerId: string;
let orderId: string;

/** Zarfı açar; `error` doluysa iddia orada patlasın diye ayrıca kontrol edilir. */
async function dataOf<T>(res: Response): Promise<T> {
  const envelope = (await res.json()) as { data: T; error: string | null };
  expect(envelope.error).toBeNull();
  return envelope.data;
}

const postJson = (path: string, body: unknown) =>
  app.request(path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

/* Yayın kısıtlarının şartı: aktif ürünün ad, açıklama, içindekiler ve saklama metni üç dilde dolu, alerjen beyanı girilmiş olmalı
   (`product_publish_requires_*`); karşılanmazsa `beforeAll` düşer ve testler ilgisiz görünen bir sebeple atlanır. */
const ucDil = (metin: string) => ({ tr: metin, fr: metin, de: metin });
const yayinaHazir = {
  // Satıştaki boyun net miktarı zorunlu (tetikleyici, `0005`): "yayına hazır" gövde onu da taşır.
  variants: [{ netQuantity: 500, netUnit: 'g' as const }],
  description: ucDil('Geri bildirim testi ürünü'),
  ingredients: ucDil('Un, su, tuz'),
  storageInstructions: ucDil('Serin yerde saklayın'),
  allergens: [],
};

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'FB' })).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `VFB Kat ${stamp}` } })).id;
  const seeded = await new ProductService(db).create({
    /* Ad üç dilde ama üçü ayrı metin: aşağıdaki test kartın adında "FR" arar, eşit metin o iddiayı sessizce boşa çıkarırdı. */
    name: { tr: `VFB Börek ${stamp}`, fr: `VFB Börek FR ${stamp}`, de: `VFB Börek DE ${stamp}` },
    categoryId,
    status: 'active',
    ...yayinaHazir,
    variants: [{ label: { tr: '500 g' }, netQuantity: 500, netUnit: 'g' }],
  });
  productId = seeded.product.id;
  customerId = (await new UserProfileService(db).insert({ name: 'Fatma Demir', email: `vfb-${stamp}@example.test` })).id;

  const { order } = await new OrderService(db).create(
    { warehouseId, customerId, channel: 'b2c', orderSource: 'web', deliveryType: 'shipping', status: 'confirmed', orderedTotalCents: 900 },
    [{ variantId: seeded.variants[0]!.id, qty: 1, unitPriceCents: 900, vatRate: 5.5 }],
  );
  orderId = order.id;
});

beforeEach(async () => {
  // Yalnız kendi satırlarımız — davet ve cevaplar testler arasında sıfırlanır.
  await mustDelete(db, 'product_feedback', (q) => q.eq('product_id', productId));
  await mustDelete(db, 'points_entry', (q) => q.eq('customer_id', customerId));
  await mustDelete(db, 'feedback_request', (q) => q.eq('order_id', orderId));
});

afterAll(async () => {
  // Davet satırı ayrıca silinmez: `feedback_request.order_id` `cascade` olduğu için sipariş gidince o da gider.
  // `beforeEach`teki silme başka iş görür: testler arası izolasyon.
  await purgeTestData(db, {
    orderIds: [orderId],
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: [customerId],
    warehouseIds: [warehouseId],
  });
});

function inviteForOrder() {
  return requests.insert({ orderId, customerId, token: feedbackToken(), channel: 'email' });
}

describe('GET /api/v1/feedback/:token', () => {
  it('davet sözleşme şekliyle döner; kimlik alanları zarfa SIZMAZ', async () => {
    const request = await inviteForOrder();
    const res = await app.request(`/api/v1/feedback/${request.token}?locale=fr`);
    expect(res.status).toBe(200);

    const raw = await dataOf<Record<string, unknown>>(res);
    // `parse` süzgeci: uygulama görünümündeki requestId/customerId telde YOK.
    expect(raw).not.toHaveProperty('requestId');
    expect(raw).not.toHaveProperty('customerId');

    const invite: FeedbackInvite = FeedbackInviteSchema.parse(raw);
    expect(invite.cards).toHaveLength(1);
    // Dil sorgudan: kart adı SUNUCUDA çözülür (fr yazılmışsa fr gelir).
    expect(invite.cards[0]?.name).toContain('FR');
    expect(invite.progress).toEqual({ rated: 0, total: 1 });
  });

  it('locale zorunlu (400); geçersiz token adlı retle 404', async () => {
    const request = await inviteForOrder();
    expect((await app.request(`/api/v1/feedback/${request.token}`)).status).toBe(400);

    const res = await app.request('/api/v1/feedback/GECERSIZTOKEN123?locale=tr');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ data: null, error: 'invalid_link' });
  });
});

describe('yazım uçları', () => {
  it('oy yazılır; bozuk gövde 400 invalid_body', async () => {
    const request = await inviteForOrder();
    const res = await postJson(`/api/v1/feedback/${request.token}/vote`, { productId, vote: 'like' });
    expect(res.status).toBe(200);
    expect(await dataOf(res)).toEqual({ recorded: true });

    const bozuk = await postJson(`/api/v1/feedback/${request.token}/vote`, { productId, vote: 'love' });
    expect(bozuk.status).toBe(400);
    expect(((await bozuk.json()) as { error: string }).error).toBe('invalid_body');
  });

  it('boş yorum adlı rettir (review_empty); dolu yorum kaydolur', async () => {
    const request = await inviteForOrder();
    const bos = await postJson(`/api/v1/feedback/${request.token}/review`, { productId });
    expect(bos.status).toBe(400);
    expect(((await bos.json()) as { error: string }).error).toBe('review_empty');

    const dolu = await postJson(`/api/v1/feedback/${request.token}/review`, { productId, comment: `Enfesti ${stamp}` });
    expect(dolu.status).toBe(200);
  });
});

describe('POST /api/v1/feedback/:token/complete', () => {
  it('akış sonu sözleşme şekliyle döner; ikinci tamamlama puan vermez', async () => {
    const request = await inviteForOrder();
    await postJson(`/api/v1/feedback/${request.token}/vote`, { productId, vote: 'like' });

    const first = FeedbackCompletionSchema.parse(await dataOf(await postJson(`/api/v1/feedback/${request.token}/complete`, {})));
    expect(first.pointsAwarded).toBeGreaterThan(0);

    const second = FeedbackCompletionSchema.parse(await dataOf(await postJson(`/api/v1/feedback/${request.token}/complete`, {})));
    expect(second.pointsAwarded).toBe(0);
    expect(second.balance).toBe(first.balance);
  });
});
