import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CategoryService,
  FeedbackRequestService,
  OrderService,
  ProductService,
  SettingsService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import {
  completeFeedbackInvite,
  createDueFeedbackRequests,
  listPendingInvites,
  markInviteSent,
  openFeedbackInvite,
  type FeedbackCompletion,
  type FeedbackInviteView,
} from './invite';
import { getPointsBalance } from './points';
import { recordVote } from './product-feedback';

/**
 * Alım-sonrası davet akışı (17.2, 17.6) — uçtan uca.
 *
 * Sınanan şey dört kural: **zamanı gelmeyen davet edilmez**, **sipariş başına tek davet**,
 * **yarıda bırakılan akış kaldığı yerden devam eder**, **memnun olmayan Google'a yönlendirilmez**.
 */
const db = serviceDb();
const requests = new FeedbackRequestService(db);
const orders = new OrderService(db);

const stamp = Date.now();
const createdProfiles: string[] = [];
const createdOrders: string[] = [];
let customerId: string;
let productId: string;
let secondProductId: string;
let variantId: string;
let secondVariantId: string;
let categoryId: string;
let deliveredOrderId: string;

/** Siparişi teslim edilmiş göstermek için durum geçişini geçmişe damgalar. */
async function markDelivered(orderId: string, daysAgo: number) {
  const at = new Date();
  at.setDate(at.getDate() - daysAgo);
  await db.from('order').update({ status: 'delivered' }).eq('id', orderId);
  await db.from('order_status_log').insert({
    order_id: orderId,
    from_status: 'out_for_delivery',
    to_status: 'delivered',
    created_at: at.toISOString(),
  });
}

beforeAll(async () => {
  const products = new ProductService(db);
  categoryId = (await new CategoryService(db).create({ name: { tr: `Davet testi ${stamp}` } })).id;

  const first = await products.create({ name: { tr: `Davet ürünü ${stamp}` }, categoryId, variants: [{ label: { tr: '1 kg' } }] });
  productId = first.product.id;
  variantId = first.variants[0]!.id;

  const second = await products.create({ name: { tr: `İkinci ürün ${stamp}` }, categoryId, variants: [{ label: { tr: '500 g' } }] });
  secondProductId = second.product.id;
  secondVariantId = second.variants[0]!.id;

  customerId = (await new UserProfileService(db).insert({ name: 'Ayşe Kaya', email: `davet-${stamp}@example.test` })).id;
  createdProfiles.push(customerId);

  // İki ürünlü, 12 gün önce teslim edilmiş sipariş — davet zamanı geçmiş.
  const { order } = await orders.create(
    { customerId, channel: 'b2c', orderSource: 'web', deliveryType: 'shipping', status: 'confirmed', total: 20 },
    [
      { variantId, qty: 1, unitPrice: 12, vatRate: 5.5 },
      { variantId: secondVariantId, qty: 1, unitPrice: 8, vatRate: 5.5 },
    ],
  );
  deliveredOrderId = order.id;
  createdOrders.push(order.id);
  await markDelivered(order.id, 12);
});

beforeEach(async () => {
  await db.from('product_feedback').delete().in('product_id', [productId, secondProductId]);
  await db.from('points_entry').delete().in('customer_id', createdProfiles);
  await db.from('feedback_request').delete().in('order_id', createdOrders);
  await new SettingsService(db).set('google_review_url', '');
});

afterAll(async () => {
  await db.from('product_feedback').delete().in('product_id', [productId, secondProductId]);
  await db.from('points_entry').delete().in('customer_id', createdProfiles);
  await db.from('feedback_request').delete().in('order_id', createdOrders);
  for (const id of createdOrders) await db.from('order').delete().eq('id', id);
  await purgeTestData(db, { productIds: [productId, secondProductId], categoryIds: [categoryId], profileIds: createdProfiles });
  await new SettingsService(db).set('google_review_url', '');
});

/** Bu siparişin davetini açar (tarama tüm veritabanını tarıyor; bizimkini ayıklıyoruz). */
async function inviteForOrder() {
  await createDueFeedbackRequests({ limit: 500 });
  const request = await requests.findByOrder(deliveredOrderId);
  if (!request) throw new Error('davet oluşmadı');
  return request;
}

describe('davet oluşturma', () => {
  it('zamanı gelen teslim edilmiş sipariş davet alır', async () => {
    const request = await inviteForOrder();
    expect(request).toMatchObject({ customerId, channel: 'email', sentAt: null, completedAt: null });
    // Token oturum yerine geçer: uzun ve okunabilir alfabeden.
    expect(request.token).toMatch(/^[34679ACDEFGHJKLMNPQRTUVWXY]{16}$/);
  });

  it('sipariş başına tek davet — ikinci tarama yeni davet açmaz', async () => {
    const first = await inviteForOrder();
    await createDueFeedbackRequests({ limit: 500 });
    expect((await requests.findByOrder(deliveredOrderId))?.id).toBe(first.id);
  });

  it('zamanı gelmemiş sipariş davet almaz', async () => {
    const { order } = await orders.create(
      { customerId, channel: 'b2c', orderSource: 'web', deliveryType: 'shipping', status: 'confirmed', total: 12 },
      [{ variantId, qty: 1, unitPrice: 12, vatRate: 5.5 }],
    );
    createdOrders.push(order.id);
    await markDelivered(order.id, 2); // daha 2 gün olmuş

    await createDueFeedbackRequests({ limit: 500 });
    expect(await requests.findByOrder(order.id)).toBeNull();
  });

  it('gönderim ayrı bir adımdır — oluşan davet kuyrukta bekler', async () => {
    const request = await inviteForOrder();
    const pending = await listPendingInvites(500);
    expect(pending.some((r) => r.id === request.id)).toBe(true);

    await markInviteSent(request.id);
    const after = await listPendingInvites(500);
    expect(after.some((r) => r.id === request.id)).toBe(false);
  });
});

describe('davetin açılması', () => {
  it('token akışı açar; her ürün bir kart', async () => {
    const request = await inviteForOrder();
    const view: FeedbackInviteView | null = await openFeedbackInvite('tr', request.token);

    expect(view?.cards).toHaveLength(2);
    expect(view?.progress).toEqual({ rated: 0, total: 2 });
    expect(view?.completedAt).toBeNull();
  });

  it('geçersiz token yok görünür', async () => {
    expect(await openFeedbackInvite('tr', 'GECERSIZTOKEN123')).toBeNull();
  });

  it('yarıda bırakılan akış kaldığı yerden devam eder', async () => {
    const request = await inviteForOrder();
    await recordVote({ customerId, productId, context: 'purchase', vote: 'like', feedbackRequestId: request.id });

    const view = await openFeedbackInvite('tr', request.token);
    expect(view?.progress).toEqual({ rated: 1, total: 2 });
    expect(view?.cards.find((c) => c.productId === productId)?.existing).toMatchObject({ vote: 'like' });
    expect(view?.cards.find((c) => c.productId === secondProductId)?.existing).toBeNull();
  });
});

describe('akışın tamamlanması', () => {
  it('tamamlayan müşteri puan kazanır — beğeniden bağımsız', async () => {
    const request = await inviteForOrder();
    // Her ikisini de BEĞENMEDİ: ödül yine de verilir (DOMAIN §14).
    await recordVote({ customerId, productId, context: 'purchase', vote: 'dislike', feedbackRequestId: request.id });

    const result = await completeFeedbackInvite(request.token);
    expect(result?.pointsAwarded).toBeGreaterThan(0);
    expect((await getPointsBalance(customerId)).balance).toBe(result?.balance);
  });

  it('ikinci tamamlama puan vermez — teşekkür durumu gösterilir', async () => {
    const request = await inviteForOrder();
    const first = await completeFeedbackInvite(request.token);
    const second = await completeFeedbackInvite(request.token);

    expect(first?.pointsAwarded).toBeGreaterThan(0);
    expect(second?.pointsAwarded).toBe(0);
    expect(second?.balance).toBe(first?.balance);
  });

  it('memnun müşteri Google değerlendirmesine davet edilir', async () => {
    await new SettingsService(db).set('google_review_url', 'https://g.page/r/test/review');
    const request = await inviteForOrder();
    await recordVote({ customerId, productId, context: 'purchase', vote: 'like', feedbackRequestId: request.id });
    await recordVote({ customerId, productId: secondProductId, context: 'purchase', vote: 'like', feedbackRequestId: request.id });

    const result: FeedbackCompletion | null = await completeFeedbackInvite(request.token);
    expect(result?.outcome).toBe('google_review');
    expect(result?.googleReviewUrl).toBe('https://g.page/r/test/review');
  });

  it('memnun OLMAYAN müşteri Google\'a yönlendirilmez — sorun bildirmeye çağrılır', async () => {
    await new SettingsService(db).set('google_review_url', 'https://g.page/r/test/review');
    const request = await inviteForOrder();
    await recordVote({ customerId, productId, context: 'purchase', vote: 'dislike', feedbackRequestId: request.id });

    const result = await completeFeedbackInvite(request.token);
    expect(result?.outcome).toBe('report_issue');
    expect(result?.googleReviewUrl).toBeNull();
  });

  it('Google bağlantısı ayarlı değilse memnun müşteriye de gösterilmez', async () => {
    const request = await inviteForOrder();
    await recordVote({ customerId, productId, context: 'purchase', vote: 'like', feedbackRequestId: request.id });

    const result = await completeFeedbackInvite(request.token);
    expect(result?.outcome).toBe('thanks');
    expect(result?.googleReviewUrl).toBeNull();
  });

  it('geçersiz token tamamlanamaz', async () => {
    expect(await completeFeedbackInvite('GECERSIZTOKEN123')).toBeNull();
  });
});
