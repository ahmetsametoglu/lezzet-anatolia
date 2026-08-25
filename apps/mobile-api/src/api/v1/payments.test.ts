import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, OrderService, ProductService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { app } from '../../app';
import { bearer, createSignedInUser, envelopeError } from '../../lib/testing';

/**
 * ÖDEME NİYETİ — `/api/v1/payments`, iki uç.
 *
 * ── ÇİVİLENEN ASIL KARAR: NİYET SAHİBİNİN SİPARİŞİNE AÇILIR ─────────────────
 * `POST /intents` referansı **kimliğe daraltarak** okuyor
 * (`findByReference(reference, customerId)`). Kural gevşerse, referans numarasını bilen biri
 * BAŞKASININ siparişi için ödeme oturumu açtırabilir — sipariş tutarı, kalemleri ve müşteri
 * künyesi sağlayıcıya o oturumla birlikte gider.
 *
 * Referans gizli bir değer değil (mailde, faturada, kargo etiketinde dolaşıyor); gizliliği
 * sağlayan tek şey bu daraltma. Aynı kural sipariş detayında da var ve orada da sınanıyor
 * (`orders.test.ts`) — ikisi AYRI uçlar ve biri düzeltilirken öteki unutulabilir.
 *
 * ── SAĞLAYICI YOKLUĞU BİR RETTİR, ÇÖKÜŞ DEĞİL ───────────────────────────────
 * Anahtar yoksa `503 provider_unavailable` dönüyor. Bu, yerel ve test ortamının NORMAL hâli;
 * uç bunun için çökmemeli ya da 500 dönmemeli — ekran "ödeme şu an açılamıyor" diyebilmeli.
 */
const db = serviceDb();
const stamp = Date.now();

const authUserIds: string[] = [];
const profileIds: string[] = [];
let warehouseId: string;
let categoryId: string;
let productId: string;
let variantId: string;
let benimToken: string;
let otekiReferansi: string;

function post(body: unknown, token: string) {
  return app.request('/api/v1/payments/intents', {
    method: 'POST',
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'ODN' })).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Ödeme niyeti ${stamp}` } })).id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Niyet böreği ${stamp}` },
    categoryId,
    shelfLifeDays: 200,
    variants: [{ label: { tr: '500 g' } }],
  });
  productId = product.id;
  variantId = variants[0]!.id;

  const benim = await createSignedInUser({ prefix: 'payments-api', label: 'benim' });
  const oteki = await createSignedInUser({ prefix: 'payments-api', label: 'oteki' });
  benimToken = benim.token;
  authUserIds.push(benim.authUserId, oteki.authUserId);
  profileIds.push(benim.profileId, oteki.profileId);

  // Referans SONRADAN yazılır (`create` almıyor) — `orders.test.ts`in aynı ölçümü.
  otekiReferansi = `LZP-${stamp}`;
  const { order } = await new OrderService(db).create(
    { warehouseId, customerId: oteki.profileId, channel: 'b2c', deliveryType: 'shipping', totalCents: 2000 },
    [{ variantId, qty: 1, unitPriceCents: 2000, vatRate: 5.5 }],
  );
  await db.from('order').update({ reference_no: otekiReferansi, status: 'confirmed' }).eq('id', order.id);
});

afterAll(async () => {
  for (const id of profileIds) await db.from('order').delete().eq('customer_id', id);
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds,
    authUserIds,
    warehouseIds: [warehouseId],
  });
});

describe('POST /api/v1/payments/intents', () => {
  it('Bearer olmadan 401 — ödeme oturumu oturumsuz açılmaz', async () => {
    const res = await app.request('/api/v1/payments/intents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reference: otekiReferansi }),
    });

    expect(res.status).toBe(401);
  });

  it('BAŞKASININ siparişine niyet açılamaz — 404', async () => {
    /* Bu dosyanın asıl iddiası. Referans numarası dolaşımdadır; daraltma düşerse burası 200 döner
       ve o an başkasının siparişi için ödeme oturumu açılabilir. */
    const res = await post({ reference: otekiReferansi }, benimToken);

    expect(res.status).toBe(404);
    expect(await envelopeError(res)).toBe('order_not_found');
  });

  it('OLMAYAN referans 404 `order_not_found`', async () => {
    const res = await post({ reference: `YOK-${stamp}` }, benimToken);

    expect(res.status).toBe(404);
    expect(await envelopeError(res)).toBe('order_not_found');
  });

  it('BOZUK gövde 400 `invalid_body` — referanssız niyet bir niyet değildir', async () => {
    const res = await post({}, benimToken);

    expect(res.status).toBe(400);
    expect(await envelopeError(res)).toBe('invalid_body');
  });

  it('gövdesiz istek 400', async () => {
    const res = await app.request('/api/v1/payments/intents', { method: 'POST', headers: bearer(benimToken) });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/payments/intents/:id', () => {
  it('Bearer olmadan 401', async () => {
    expect((await app.request('/api/v1/payments/intents/pi_test')).status).toBe(401);
  });

  it('SAĞLAYICI ya da KİMLİK sorunu ADLI retle döner — 500 DEĞİL', async () => {
    /* Yerelde Stripe anahtarı olabilir de olmayabilir de; ikisinde de uç ADLI bir ret dönmeli:
       anahtar yoksa `provider_unavailable` (503), varsa tanınmayan kimlik için kendi reddi.
       Sınanan şey hangi ret olduğu değil — **çökmediği ve 500 dönmediği**. Bir sağlayıcı arızası
       ekranı "bir şeyler ters gitti"ye düşürmemeli. */
    const res = await app.request('/api/v1/payments/intents/pi_olmayan_kimlik', { headers: bearer(benimToken) });

    expect(res.status).not.toBe(500);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await envelopeError(res)).toBeTruthy();
  });
});
