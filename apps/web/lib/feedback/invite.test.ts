import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CategoryService,
  FeedbackRequestService,
  OrderService,
  ProductService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { purgeTestData, settingsSnapshot, createTestWarehouse } from '@lezzet/database/testing';
import { feedbackToken } from '@lezzet/domain-core';
import {
  completeFeedbackInvite,
  openFeedbackInvite,
  type FeedbackCompletion,
  type FeedbackInviteView,
} from './invite';
import { getPointsBalance } from './points';
import { recordVote } from './product-feedback';

/**
 * Alım-sonrası davet akışının müşteri yüzü (17.2, 17.6) — açılış ve tamamlanma.
 *
 * Sınanan üç kural: **yarıda bırakılan akış kaldığı yerden devam eder**, **puan tamamlamaya
 * bağlıdır beğeniye değil**, **memnun olmayan dış değerlendirmeye yönlendirilmez**.
 *
 * Daveti OLUŞTURAN tarama zamanlanmış bir iştir ve `apps/backend`'de yaşar; testi de orada.
 * Burada davet doğrudan yazılır — sınanan şey akışın kendisi, taramanın zamanlaması değil.
 */
const db = serviceDb();
const requests = new FeedbackRequestService(db);
const orders = new OrderService(db);
// Paylaşılan ayar satırları geri konur (CLAUDE.md §4b) — `settings` küresel tekildir.
const settings = settingsSnapshot(db);

const stamp = Date.now();
const createdProfiles: string[] = [];
const createdOrders: string[] = [];
let customerId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
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
  warehouseId = (await createTestWarehouse(db)).id;
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
    { warehouseId, customerId, channel: 'b2c', orderSource: 'web', deliveryType: 'shipping', status: 'confirmed', totalCents: 2000 },
    [
      { variantId, qty: 1, unitPriceCents: 1200, vatRate: 5.5 },
      { variantId: secondVariantId, qty: 1, unitPriceCents: 800, vatRate: 5.5 },
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
  await settings.override('review_platform_url', '');
});

afterAll(async () => {
  await db.from('product_feedback').delete().in('product_id', [productId, secondProductId]);
  await db.from('points_entry').delete().in('customer_id', createdProfiles);
  await db.from('feedback_request').delete().in('order_id', createdOrders);
  for (const id of createdOrders) await db.from('order').delete().eq('id', id);
  await purgeTestData(db, { productIds: [productId, secondProductId], categoryIds: [categoryId], profileIds: createdProfiles });
  await settings.restore();
  await db.from('warehouse').delete().eq('id', warehouseId);
});

/** Bu siparişin davetini açar — taramanın yaptığını doğrudan yaparak. */
function inviteForOrder() {
  return requests.insert({ orderId: deliveredOrderId, customerId, token: feedbackToken(), channel: 'email' });
}

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

  it('süresi geçmiş token de yok görünür — oturum yerine geçen anahtar ölümsüz olamaz', async () => {
    const request = await inviteForOrder();
    await db.from('feedback_request').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', request.id);

    // Mail arşivinde ya da iletilmiş bir mesajda kalan bağlantı yıllar sonra açılmamalı.
    expect(await openFeedbackInvite('tr', request.token)).toBeNull();
    expect(await completeFeedbackInvite(request.token)).toBeNull();
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

  it('memnun müşteri dış değerlendirmeye davet edilir — platform ayardan gelir', async () => {
    await settings.override('review_platform_url', 'https://fr.trustpilot.com/evaluate/lezzet.test');
    await settings.override('review_platform_name', 'Trustpilot');
    const request = await inviteForOrder();
    await recordVote({ customerId, productId, context: 'purchase', vote: 'like', feedbackRequestId: request.id });
    await recordVote({ customerId, productId: secondProductId, context: 'purchase', vote: 'like', feedbackRequestId: request.id });

    const result: FeedbackCompletion | null = await completeFeedbackInvite(request.token);
    expect(result?.outcome).toBe('review_invite');
    // Platform değişmesi KOD değil ayar değişikliğidir: motor vendor adı bilmez.
    expect(result?.reviewUrl).toBe('https://fr.trustpilot.com/evaluate/lezzet.test');
    expect(result?.reviewPlatform).toBe('Trustpilot');
  });

  it('memnun OLMAYAN müşteri dışarı yönlendirilmez — sorun bildirmeye çağrılır', async () => {
    await settings.override('review_platform_url', 'https://g.page/r/test/review');
    const request = await inviteForOrder();
    await recordVote({ customerId, productId, context: 'purchase', vote: 'dislike', feedbackRequestId: request.id });

    const result = await completeFeedbackInvite(request.token);
    expect(result?.outcome).toBe('report_issue');
    expect(result?.reviewUrl).toBeNull();
  });

  it('bağlantı ayarlı değilse memnun müşteriye de gösterilmez', async () => {
    const request = await inviteForOrder();
    await recordVote({ customerId, productId, context: 'purchase', vote: 'like', feedbackRequestId: request.id });

    const result = await completeFeedbackInvite(request.token);
    expect(result?.outcome).toBe('thanks');
    expect(result?.reviewUrl).toBeNull();
  });

  it('geçersiz token tamamlanamaz', async () => {
    expect(await completeFeedbackInvite('GECERSIZTOKEN123')).toBeNull();
  });
});

/**
 * Ekranın SÖZ VERDİĞİ alanlar (08.7 · 03.08) — karşılama ekranı bunları basıyor.
 *
 * Ayrı bir bölüm, çünkü sınanan şey akış değil **sözleşme**: davet sayfası müşteriye "tamamlayınca
 * +N puan sizindir" diye bir söz veriyor ve o N ayardan gelmek zorunda. Kodlanmış olsaydı ayar
 * değiştiği gün ekran, sistemin vermeyeceği bir sayı söylerdi — hesap kartındaki eşiğin 300/500
 * ayrışması (29.07 denetimi) tam olarak bu hataydı ve orada müşteri reddedilecek bir düğmeye
 * basıyordu. Aynı tuzağa iki kez düşmemek için kural burada sınanıyor.
 */
describe('karşılama ekranının alanları', () => {
  it('tamamlama puanı AYARDAN okunur, koda gömülmez', async () => {
    await settings.override('points_feedback_purchase', '42');
    const request = await inviteForOrder();

    expect((await openFeedbackInvite('tr', request.token))?.completionPoints).toBe(42);
  });

  it('müşteri adı ve sipariş tarihi gelir — karşılama ve teşekkür ekranı ikisini de yazıyor', async () => {
    const request = await inviteForOrder();

    const view = await openFeedbackInvite('tr', request.token);
    expect(view?.customerName).toBeTruthy();
    // Tarih HAM ISO gelir; biçimleme ekranın işi (dil orada belli).
    expect(view?.orderedOn).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});
