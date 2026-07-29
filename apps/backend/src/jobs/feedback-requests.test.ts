import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CategoryService,
  FeedbackRequestService,
  OrderService,
  ProductService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { createDueFeedbackRequests, listPendingInvites, markInviteSent } from './feedback-requests';

/**
 * Davet taraması (17.2) — zamanlanmış işin kendisi.
 *
 * Sınanan üç kural: **zamanı gelmeyen davet edilmez**, **sipariş başına tek davet** (ikinci tarama
 * no-op), **oluşturma ile gönderim ayrı adımlar**.
 */
const db = serviceDb();
const requests = new FeedbackRequestService(db);
const orders = new OrderService(db);

const stamp = Date.now();
const createdOrders: string[] = [];
let customerId: string;
let productId: string;
let variantId: string;
let categoryId: string;
let dueOrderId: string;

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

async function newOrder(): Promise<string> {
  const { order } = await orders.create(
    { customerId, channel: 'b2c', orderSource: 'web', deliveryType: 'shipping', status: 'confirmed', total: 12 },
    [{ variantId, qty: 1, unitPrice: 12, vatRate: 5.5 }],
  );
  createdOrders.push(order.id);
  return order.id;
}

beforeAll(async () => {
  categoryId = (await new CategoryService(db).create({ name: { tr: `Tarama testi ${stamp}` } })).id;
  const created = await new ProductService(db).create({
    name: { tr: `Tarama ürünü ${stamp}` },
    categoryId,
    variants: [{ label: { tr: '1 kg' } }],
  });
  productId = created.product.id;
  variantId = created.variants[0]!.id;

  customerId = (await new UserProfileService(db).insert({ name: 'Deniz Yıldız', email: `tarama-${stamp}@example.test` })).id;

  dueOrderId = await newOrder();
  await markDelivered(dueOrderId, 12); // eşik 10 gün — zamanı geçmiş
});

beforeEach(async () => {
  await db.from('feedback_request').delete().in('order_id', createdOrders);
});

afterAll(async () => {
  await db.from('feedback_request').delete().in('order_id', createdOrders);
  for (const id of createdOrders) await db.from('order').delete().eq('id', id);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: [customerId] });
});

describe('createDueFeedbackRequests', () => {
  it('zamanı gelen teslim edilmiş sipariş davet alır', async () => {
    await createDueFeedbackRequests({ limit: 500 });
    const request = await requests.findByOrder(dueOrderId);

    expect(request).toMatchObject({ customerId, channel: 'email', sentAt: null, completedAt: null });
    // Token oturum yerine geçer: uzun ve okunabilir alfabeden.
    expect(request?.token).toMatch(/^[34679ACDEFGHJKLMNPQRTUVWXY]{16}$/);
  });

  it('ikinci tarama yeni davet açmaz — sipariş başına tek davet', async () => {
    await createDueFeedbackRequests({ limit: 500 });
    const first = await requests.findByOrder(dueOrderId);
    await createDueFeedbackRequests({ limit: 500 });

    expect((await requests.findByOrder(dueOrderId))?.id).toBe(first?.id);
  });

  it('zamanı gelmemiş sipariş davet almaz', async () => {
    const orderId = await newOrder();
    await markDelivered(orderId, 2); // daha 2 gün olmuş

    await createDueFeedbackRequests({ limit: 500 });
    expect(await requests.findByOrder(orderId)).toBeNull();
  });

  it('teslim edilmemiş sipariş davet almaz', async () => {
    const orderId = await newOrder(); // `confirmed` kalır, teslim kaydı yok

    await createDueFeedbackRequests({ limit: 500 });
    expect(await requests.findByOrder(orderId)).toBeNull();
  });
});

describe('gönderim kuyruğu', () => {
  it('oluşan davet gönderilene kadar kuyrukta bekler', async () => {
    await createDueFeedbackRequests({ limit: 500 });
    const request = await requests.findByOrder(dueOrderId);

    expect((await listPendingInvites(500)).some((r) => r.id === request!.id)).toBe(true);
    await markInviteSent(request!.id);
    expect((await listPendingInvites(500)).some((r) => r.id === request!.id)).toBe(false);
  });
});
