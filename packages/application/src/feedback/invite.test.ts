import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CategoryService,
  FeedbackRequestService,
  OrderService,
  ProductService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { mustDelete, purgeTestData, settingsSnapshot, createTestWarehouse } from '@lezzet/database/testing';
import { feedbackToken } from '@lezzet/domain-core';
import { completeFeedbackInvite, openFeedbackInvite, type FeedbackCompletion, type FeedbackInviteView } from './invite';
import { getPointsBalance } from './points';
import { reviewFeedbackInvite, voteOnFeedbackInvite } from './write';

/**
 * Alım-sonrası davet akışının PAKET kapıları (17.2 · 17.6) — web `lib/feedback/invite.test.ts`in
 * terfi eden kurallar için ikizi: web köprüsü benimsendiğinde iki yüzeyin TEK kuralı burada
 * kanıtlı kalır.
 *
 * Sınanan kurallar: **kimlik token'dan çözülür** (kapılar `customerId` almaz), **satın alınmamış
 * ürüne yazılamaz**, **yarıda bırakılan akış kaldığı yerden devam eder**, **verilmeyen alan
 * silinmez** (kısmi güncelleme), **puan tamamlamaya bağlıdır beğeniye değil** ve **ikinci
 * tamamlama puan vermez**.
 *
 * Paylaşılan DB (CLAUDE.md §4b): satırlar damgalı, hiçbir iddia küresel sayıya bakmaz; ara
 * temizlik yalnız BU dosyanın kurduğu satırlara daraltılmış `mustDelete` ile (sessiz yarım kalma
 * yok), son temizlik `purgeTestData` (feedback/puan satırları ürün-sipariş-profil kökünden
 * CASCADE ile gider). Ayar satırları küresel tekil — `settingsSnapshot` geri koyar.
 */
const db = serviceDb();
const requests = new FeedbackRequestService(db);
const orders = new OrderService(db);
const settings = settingsSnapshot(db);

const stamp = Date.now();
const createdProfiles: string[] = [];
const createdOrders: string[] = [];
let customerId: string;
// Depo değişmezi (DOMAIN §17): sipariş deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
let productId: string;
let secondProductId: string;
/** Siparişte OLMAYAN ürün — "satın almadan yazılamaz" kuralının mihenği. */
let foreignProductId: string;
let categoryId: string;
let deliveredOrderId: string;

/** Siparişi teslim edilmiş göstermek için durum geçişini geçmişe damgalar (emsal fikstür). */
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
  categoryId = (await new CategoryService(db).create({ name: { tr: `Paket davet testi ${stamp}` } })).id;

  const first = await products.create({ name: { tr: `Paket davet ürünü ${stamp}` }, categoryId, variants: [{ label: { tr: '1 kg' } }] });
  productId = first.product.id;

  const second = await products.create({ name: { tr: `Paket ikinci ürün ${stamp}` }, categoryId, variants: [{ label: { tr: '500 g' } }] });
  secondProductId = second.product.id;

  const foreign = await products.create({ name: { tr: `Paket yabancı ürün ${stamp}` }, categoryId, variants: [{ label: { tr: '250 g' } }] });
  foreignProductId = foreign.product.id;

  customerId = (await new UserProfileService(db).insert({ name: 'Ayşe Kaya', email: `paket-davet-${stamp}@example.test` })).id;
  createdProfiles.push(customerId);

  // İki ürünlü, 12 gün önce teslim edilmiş sipariş — davet zamanı geçmiş.
  const { order } = await orders.create(
    { warehouseId, customerId, channel: 'b2c', orderSource: 'web', deliveryType: 'shipping', status: 'confirmed', totalCents: 2000 },
    [
      { variantId: first.variants[0]!.id, qty: 1, unitPriceCents: 1200, vatRate: 5.5 },
      { variantId: second.variants[0]!.id, qty: 1, unitPriceCents: 800, vatRate: 5.5 },
    ],
  );
  deliveredOrderId = order.id;
  createdOrders.push(order.id);
  await markDelivered(order.id, 12);
});

beforeEach(async () => {
  // Yalnız BU dosyanın satırları — süzgeçler kendi kimliklerimize kilitli (CLAUDE.md §4b).
  await mustDelete(db, 'product_feedback', (q) => q.in('product_id', [productId, secondProductId, foreignProductId]));
  await mustDelete(db, 'points_entry', (q) => q.in('customer_id', createdProfiles));
  await mustDelete(db, 'feedback_request', (q) => q.in('order_id', createdOrders));
  await settings.override('review_platform_url', '');
});

afterAll(async () => {
  await mustDelete(db, 'feedback_request', (q) => q.in('order_id', createdOrders));
  await purgeTestData(db, {
    orderIds: createdOrders,
    productIds: [productId, secondProductId, foreignProductId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    warehouseIds: [warehouseId],
  });
  await settings.restore();
});

/** Bu siparişin davetini açar — taramanın yaptığını doğrudan yaparak (emsal). */
function inviteForOrder() {
  return requests.insert({ orderId: deliveredOrderId, customerId, token: feedbackToken(), channel: 'email' });
}

describe('davetin açılması', () => {
  it('token akışı açar; her ürün bir kart, görsel katalog şekliyle gelir', async () => {
    const request = await inviteForOrder();
    const view: FeedbackInviteView | null = await openFeedbackInvite(db, 'tr', request.token);

    expect(view?.cards).toHaveLength(2);
    expect(view?.progress).toEqual({ rated: 0, total: 2 });
    expect(view?.completedAt).toBeNull();
    // Görsel `StorefrontImage`: anahtar değil çözülmüş şekil — mobil sözleşme bunu okuyor.
    expect(view?.cards[0]?.image).toHaveProperty('crop');
  });

  it('geçersiz ve süresi geçmiş token yok görünür — oturum yerine geçen anahtar ölümsüz olamaz', async () => {
    expect(await openFeedbackInvite(db, 'tr', 'GECERSIZTOKEN123')).toBeNull();

    const request = await inviteForOrder();
    await db.from('feedback_request').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', request.id);
    expect(await openFeedbackInvite(db, 'tr', request.token)).toBeNull();
    expect(await completeFeedbackInvite(db, request.token)).toBeNull();
    expect((await voteOnFeedbackInvite(db, { token: request.token, productId, vote: 'like' })).status).toBe('invalid_link');
  });

  it('yarıda bırakılan akış kaldığı yerden devam eder', async () => {
    const request = await inviteForOrder();
    await voteOnFeedbackInvite(db, { token: request.token, productId, vote: 'like' });

    const view = await openFeedbackInvite(db, 'tr', request.token);
    expect(view?.progress).toEqual({ rated: 1, total: 2 });
    expect(view?.cards.find((c) => c.productId === productId)?.existing).toMatchObject({ vote: 'like' });
    expect(view?.cards.find((c) => c.productId === secondProductId)?.existing).toBeNull();
  });
});

describe('token’lı yazım kapıları', () => {
  it('kimlik token’dan çözülür; siparişte olmayan ürüne yazılamaz', async () => {
    const request = await inviteForOrder();
    const outcome = await voteOnFeedbackInvite(db, { token: request.token, productId: foreignProductId, vote: 'like' });
    // Kart listesi siparişten gelir; bu hâl ancak veriyle oynanırsa doğar — veri katmanı reddeder.
    expect(outcome.status).toBe('not_purchased');
  });

  it('metinli yorum kuyruğa doğar; oy KISMİ güncellemedir — verilmeyen alan silinmez', async () => {
    const request = await inviteForOrder();
    const voted = await voteOnFeedbackInvite(db, { token: request.token, productId, vote: 'like' });
    expect(voted.status).toBe('ok');
    if (voted.status !== 'ok') return;
    // Metinsiz kayıt doğrudan yayında: okunacak bir şey yok (`initialFeedbackStatus`).
    expect(voted.feedback.status).toBe('approved');

    const reviewed = await reviewFeedbackInvite(db, { token: request.token, productId, comment: `Tam annemin böreği ${stamp}` });
    expect(reviewed.status).toBe('ok');
    if (reviewed.status !== 'ok') return;
    // Metin geldi → moderasyon kuyruğu; ÖNCEKİ oy yerinde durur (tek satırda iki beyan yaşar).
    expect(reviewed.feedback.status).toBe('pending');
    expect(reviewed.feedback.vote).toBe('like');
    expect(reviewed.feedback.comment).toContain('annemin');
  });

  it('ne yıldız ne metin: adlı ret (empty_review) — hiçbir şey yazılmaz', async () => {
    const request = await inviteForOrder();
    expect((await reviewFeedbackInvite(db, { token: request.token, productId })).status).toBe('empty_review');
  });
});

describe('akışın tamamlanması', () => {
  it('tamamlayan müşteri puan kazanır — beğeniden bağımsız; ikinci tamamlama vermez', async () => {
    const request = await inviteForOrder();
    // BEĞENMEDİ: ödül yine de verilir (DOMAIN §14 — puan katılımın bedelidir, övgünün değil).
    await voteOnFeedbackInvite(db, { token: request.token, productId, vote: 'dislike' });

    const first = await completeFeedbackInvite(db, request.token);
    expect(first?.pointsAwarded).toBeGreaterThan(0);
    expect((await getPointsBalance(db, customerId)).balance).toBe(first?.balance);

    const second = await completeFeedbackInvite(db, request.token);
    expect(second?.pointsAwarded).toBe(0);
    expect(second?.balance).toBe(first?.balance);
  });

  it('memnun müşteri dış değerlendirmeye davet edilir; memnun olmayan sorun bildirmeye', async () => {
    await settings.override('review_platform_url', 'https://fr.trustpilot.com/evaluate/lezzet.test');
    await settings.override('review_platform_name', 'Trustpilot');

    const memnun = await inviteForOrder();
    await voteOnFeedbackInvite(db, { token: memnun.token, productId, vote: 'like' });
    await voteOnFeedbackInvite(db, { token: memnun.token, productId: secondProductId, vote: 'like' });
    const davet: FeedbackCompletion | null = await completeFeedbackInvite(db, memnun.token);
    expect(davet?.outcome).toBe('review_invite');
    expect(davet?.reviewUrl).toBe('https://fr.trustpilot.com/evaluate/lezzet.test');
    expect(davet?.reviewPlatform).toBe('Trustpilot');

    // Aynı davet üzerinde oylar güncellenir (tekillik müşteri+ürün): iki beğenmedi → sorun köprüsü.
    await mustDelete(db, 'feedback_request', (q) => q.in('order_id', createdOrders));
    await mustDelete(db, 'product_feedback', (q) => q.in('product_id', [productId, secondProductId]));
    const kirgin = await inviteForOrder();
    await voteOnFeedbackInvite(db, { token: kirgin.token, productId, vote: 'dislike' });
    const sorun = await completeFeedbackInvite(db, kirgin.token);
    expect(sorun?.outcome).toBe('report_issue');
    // Memnun olmayan DIŞARI yönlendirilmez — bağlantı ayarlı olsa bile.
    expect(sorun?.reviewUrl).toBeNull();
  });

  it('bağlantı ayarlı değilse memnun müşteriye de gösterilmez (thanks)', async () => {
    const request = await inviteForOrder();
    await voteOnFeedbackInvite(db, { token: request.token, productId, vote: 'like' });
    const result = await completeFeedbackInvite(db, request.token);
    expect(result?.outcome).toBe('thanks');
    expect(result?.reviewUrl).toBeNull();
  });
});

describe('karşılama ekranının sözleri', () => {
  it('tamamlama puanı AYARDAN okunur, koda gömülmez', async () => {
    await settings.override('points_feedback_purchase', '42');
    const request = await inviteForOrder();
    expect((await openFeedbackInvite(db, 'tr', request.token))?.completionPoints).toBe(42);
  });

  it('müşteri adı, sipariş referansı ve tarihi gelir — karşılama/rozet ikisini de basıyor', async () => {
    const request = await inviteForOrder();
    const view = await openFeedbackInvite(db, 'tr', request.token);
    expect(view?.customerName).toBeTruthy();
    expect(view?.orderReferenceNo).toBeTruthy();
    // Tarih HAM ISO gelir; biçimleme ekranın işi (dil orada belli).
    expect(view?.orderedOn).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});
