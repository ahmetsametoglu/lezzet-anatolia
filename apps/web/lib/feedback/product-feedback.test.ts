import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CategoryService,
  OrderService,
  ProductFeedbackService,
  ProductRatingService,
  ProductService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import type { ProductFeedback } from '@lezzet/types';
import {
  countPendingReviews,
  listCandidateDemand,
  type CandidateDemandRow,
  getProductScore,
  getProductScores,
  getReviewEligibility,
  listProductReviews,
  listReviewsForModeration,
  moderateReview,
  recordVote,
  submitReview,
  type FeedbackWriteResult,
  type PublishedReview,
} from './product-feedback';

/**
 * Ürün geri bildirimi (17.1 + 17.3 zemini) — uçtan uca.
 *
 * Sınanan şey üç kapı: **satın almayan yazamaz**, **onaylanmayan görünmez**, **moderasyon metnin
 * işidir**. Skor da bunlardan türer; onaylanmamış bir yorumun ortalamayı oynatması sistemin en
 * sessiz yalanı olurdu.
 */
const db = serviceDb();
const feedback = new ProductFeedbackService(db);
const orders = new OrderService(db);

const stamp = Date.now();
const createdProfiles: string[] = [];
const createdOrders: string[] = [];
let buyerId: string;
let strangerId: string;
let staffId: string;
let productId: string;
let otherProductId: string;
let candidateId: string;
let variantId: string;
let categoryId: string;

beforeAll(async () => {
  const products = new ProductService(db);
  categoryId = (await new CategoryService(db).create({ name: { tr: `Geri bildirim ${stamp}` } })).id;

  const { product, variants } = await products.create({
    name: { tr: `Değerlendirilen ürün ${stamp}` },
    categoryId,
    variants: [{ label: { tr: '1 kg' } }],
  });
  productId = product.id;
  variantId = variants[0]!.id;

  otherProductId = (
    await products.create({ name: { tr: `Değerlendirilmeyen ${stamp}` }, categoryId, variants: [{ label: { tr: '500 g' } }] })
  ).product.id;

  // Aday ürün: satılmıyor, yalnız keşif kartlarında görünür.
  const candidate = await products.create({ name: { tr: `Aday ürün ${stamp}` }, categoryId, variants: [{ label: { tr: '250 g' } }] });
  candidateId = candidate.product.id;
  await products.update({ id: candidateId, status: 'candidate' });

  const profiles = new UserProfileService(db);
  buyerId = (await profiles.insert({ name: 'Ayşe Kaya', email: `gb-${stamp}@example.test` })).id;
  strangerId = (await profiles.insert({ name: 'Marc Dubois', email: `gb-yabanci-${stamp}@example.test` })).id;
  staffId = (await profiles.insert({ name: 'Moderatör', email: `gb-mod-${stamp}@example.test` })).id;
  createdProfiles.push(buyerId, strangerId, staffId);

  const { order } = await orders.create(
    { customerId: buyerId, channel: 'b2c', orderSource: 'web', deliveryType: 'shipping', status: 'confirmed', total: 12 },
    [{ variantId, qty: 1, unitPrice: 12, vatRate: 5.5 }],
  );
  createdOrders.push(order.id);
});

beforeEach(async () => {
  for (const id of [productId, otherProductId, candidateId]) await db.from('product_feedback').delete().eq('product_id', id);
});

afterAll(async () => {
  for (const id of [productId, otherProductId, candidateId]) await db.from('product_feedback').delete().eq('product_id', id);
  for (const id of createdOrders) await db.from('order').delete().eq('id', id);
  await purgeTestData(db, {
    productIds: [productId, otherProductId, candidateId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
  });
});

/** Onaylı yazılı yorum kurar — skor testlerinin zemini. */
async function approvedReview(rating: number, comment = 'Fıstık cömertti.') {
  const result = await submitReview({ customerId: buyerId, productId, language: 'tr', rating, comment });
  if (!result.ok) throw new Error(`yorum yazılamadı: ${result.reason}`);
  await moderateReview({ reviewId: result.data.id, to: 'approved', moderatorId: staffId });
  return result.data;
}

describe('yalnız satın alan yazar', () => {
  it('ürünü almış müşteri yazabilir ve kayıt siparişe bağlanır', async () => {
    const result: FeedbackWriteResult<ProductFeedback> = await submitReview({
      customerId: buyerId,
      productId,
      language: 'tr',
      rating: 5,
      comment: 'Fıstık cömertti.',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ orderId: createdOrders[0], context: 'purchase', status: 'pending' });
  });

  it('almamış müşteri yazamaz', async () => {
    expect(await submitReview({ customerId: strangerId, productId, language: 'fr', rating: 5 })).toEqual({
      ok: false,
      reason: 'not_purchased',
    });
  });

  it('almadığı BAŞKA ürüne yazamaz', async () => {
    expect(await submitReview({ customerId: buyerId, productId: otherProductId, language: 'tr', rating: 4 })).toEqual({
      ok: false,
      reason: 'not_purchased',
    });
  });

  it('yıldızsız ve metinsiz yorum yazılamaz', async () => {
    expect(await submitReview({ customerId: buyerId, productId, language: 'tr', comment: '   ' })).toEqual({
      ok: false,
      reason: 'empty_review',
    });
  });
});

describe('moderasyon metnin işidir', () => {
  it('metinli yorum kuyruğa düşer', async () => {
    await submitReview({ customerId: buyerId, productId, language: 'tr', rating: 4, comment: 'Güzeldi.' });
    const pending = await listReviewsForModeration('pending', undefined, 100);
    expect(pending.rows.some((r) => r.productId === productId)).toBe(true);
  });

  it('yalnız yıldız verilmiş kayıt kuyruğa DÜŞMEZ, doğrudan yayına girer', async () => {
    const result = await submitReview({ customerId: buyerId, productId, language: 'tr', rating: 5 });
    if (!result.ok) throw new Error(result.reason);
    expect(result.data.status).toBe('approved');
    // Dil de taşınmaz: ortada dili olan bir metin yok.
    expect(result.data.language).toBeNull();

    const pending = await listReviewsForModeration('pending', undefined, 100);
    expect(pending.rows.some((r) => r.id === result.data.id)).toBe(false);
  });

  it('okunacak bir şey olmayan kayıt moderasyona sokulamaz', async () => {
    const result = await submitReview({ customerId: buyerId, productId, language: 'tr', rating: 5 });
    if (!result.ok) throw new Error(result.reason);
    expect(await moderateReview({ reviewId: result.data.id, to: 'rejected', moderatorId: staffId })).toEqual({
      ok: false,
      reason: 'nothing_to_read',
    });
  });

  it('onaylanınca yayınlanır, geri çekilince kaybolur', async () => {
    const review = await approvedReview(5, 'Harika.');
    const published = await listProductReviews(productId);
    const first: PublishedReview | undefined = published.rows[0];
    expect(first).toMatchObject({ authorName: 'Ayşe Kaya', rating: 5, comment: 'Harika.', language: 'tr' });

    await moderateReview({ reviewId: review.id, to: 'rejected', moderatorId: staffId });
    expect((await listProductReviews(productId)).rows).toHaveLength(0);
  });

  it('onaylanmış yorumun güncellenmesi onu yeniden kuyruğa sokar', async () => {
    const review = await approvedReview(5);
    await submitReview({ customerId: buyerId, productId, language: 'tr', rating: 1, comment: 'Fikrim değişti.' });

    const after = await feedback.getById(review.id);
    expect(after).toMatchObject({ status: 'pending', moderatedAt: null });
  });

  it('bekleyen sayacı kuyrukla aynı kümeyi sayar', async () => {
    const before = await countPendingReviews();
    await submitReview({ customerId: buyerId, productId, language: 'tr', rating: 4, comment: 'Fena değil.' });
    expect(await countPendingReviews()).toBe(before + 1);
  });
});

describe('beğen / geç', () => {
  it('satın alınmış ürüne beğeni verilir ve doğrudan yayına girer', async () => {
    const result = await recordVote({ customerId: buyerId, productId, context: 'purchase', vote: 'like', dwellMs: 2400 });
    expect(result.ok).toBe(true);
    if (!result.ok || !result.data) return;
    expect(result.data).toMatchObject({ vote: 'like', status: 'approved', dwellMs: 2400 });
  });

  it('almadığı ürüne alım-sonrası beğeni veremez', async () => {
    expect(await recordVote({ customerId: strangerId, productId, context: 'purchase', vote: 'like' })).toEqual({
      ok: false,
      reason: 'not_purchased',
    });
  });

  it('aday ürüne satın alma aranmadan kaydırılır', async () => {
    const result = await recordVote({ customerId: strangerId, productId: candidateId, context: 'candidate', vote: 'like' });
    expect(result.ok).toBe(true);
  });

  it('aday olmayan ürün keşif kartlarına düşmez — oradan gelen oy reddedilir', async () => {
    expect(await recordVote({ customerId: buyerId, productId, context: 'candidate', vote: 'like' })).toEqual({
      ok: false,
      reason: 'not_candidate',
    });
  });

  it('ziyaretçi de kaydırabilir; kayıt kimliksiz düşer', async () => {
    const result = await recordVote({ productId: candidateId, context: 'candidate', vote: 'like', dwellMs: 800 });
    expect(result.ok).toBe(true);
    if (!result.ok || !result.data) return;
    expect(result.data.customerId).toBeNull();
  });

  it('beğeni ile yorum TEK satırda birlikte yaşar — biri ötekini silmez', async () => {
    // Müşteri önce beğenir, sonra (belki günler sonra) yorumunu yazar. İki beyan da o satırda durur:
    // güncelleme kısmi değilse beğeni ürün puanından sessizce düşerdi.
    await recordVote({ customerId: buyerId, productId, context: 'purchase', vote: 'like', dwellMs: 2400 });
    const written = await submitReview({ customerId: buyerId, productId, language: 'tr', rating: 5, comment: 'Çok iyiydi.' });
    if (!written.ok) throw new Error(written.reason);

    expect(written.data).toMatchObject({ vote: 'like', rating: 5, comment: 'Çok iyiydi.', dwellMs: 2400 });
  });

  it('sonradan gelen beğeni ONAYLANMIŞ yorumu ne siler ne kuyruğa sokar', async () => {
    const review = await approvedReview(5, 'Harika.');
    await recordVote({ customerId: buyerId, productId, context: 'purchase', vote: 'like' });

    // Metne dokunulmadı: yeniden okunacak bir şey yok, moderasyon damgası da yerinde kalmalı.
    expect(await feedback.getById(review.id)).toMatchObject({ comment: 'Harika.', status: 'approved', vote: 'like' });
    expect((await listProductReviews(productId)).rows).toHaveLength(1);
  });

  it('yalnız yıldız gönderen istek yazılmış yorumu silmez', async () => {
    await approvedReview(4, 'İlk yorumum.');
    await submitReview({ customerId: buyerId, productId, language: 'tr', rating: 2 });

    const row = (await feedback.listByCustomer(buyerId)).find((r) => r.productId === productId);
    expect(row).toMatchObject({ rating: 2, comment: 'İlk yorumum.' });
  });

  it('aynı müşteri aynı ürünü ikinci kez kaydırırsa kayıt GÜNCELLENİR', async () => {
    const first = await recordVote({ customerId: strangerId, productId: candidateId, context: 'candidate', vote: 'like' });
    const second = await recordVote({ customerId: strangerId, productId: candidateId, context: 'candidate', vote: 'dislike' });
    expect(first.ok && second.ok && first.data?.id === second.data?.id).toBe(true);
    expect(second.ok && second.data?.vote).toBe('dislike');
  });

  it('ziyaretçi kaydırmaları tekilleştirilmez — her biri ayrı satır', async () => {
    await recordVote({ productId: candidateId, context: 'candidate', vote: 'like' });
    await recordVote({ productId: candidateId, context: 'candidate', vote: 'like' });
    const rows = (await db.from('product_feedback').select('id').eq('product_id', candidateId)).data ?? [];
    expect(rows.length).toBe(2);
  });
});

describe('ürün skoru — iki ayak', () => {
  it('yalnız onaylı beyanlardan türer', async () => {
    await submitReview({ customerId: buyerId, productId, language: 'tr', rating: 1, comment: 'Beğenmedim.' });
    // Henüz onaylanmadı: skor oluşmamalı.
    expect(await getProductScore(productId)).toMatchObject({ average: null, totalCount: 0 });

    const pending = (await feedback.listByCustomer(buyerId)).find((r) => r.productId === productId)!;
    await moderateReview({ reviewId: pending.id, to: 'approved', moderatorId: staffId });
    expect(await getProductScore(productId)).toMatchObject({ average: 1, ratingAvg: 1, ratingCount: 1 });
  });

  it('beğeni skora girer — yıldızsız üründe bile puan oluşur', async () => {
    await recordVote({ customerId: buyerId, productId, context: 'purchase', vote: 'like' });
    const score = await getProductScore(productId);
    expect(score.ratingAvg).toBeNull();
    expect(score.likeRatio).toBe(1);
    expect(score.average).toBe(5); // %100 beğeni → 5
  });

  it('yıldız ve beğeni sayı-ağırlıklı birleşir; ürünler birbirine karışmaz', async () => {
    // Aynı müşteri hem 1 yıldız verdi hem beğendi: iki ayak da tek satırda yaşar.
    await approvedReview(1, 'Fena değil ama benlik değil.');
    await recordVote({ customerId: buyerId, productId, context: 'purchase', vote: 'like' });

    // Yıldız 1, beğeni oranı %100 → beğeni ayağı 5; iki beyan eşit sayıda → ortalama 3.
    expect(await getProductScore(productId)).toMatchObject({ ratingAvg: 1, likeRatio: 1, average: 3 });
    expect(await getProductScore(otherProductId)).toMatchObject({ average: null, totalCount: 0 });
  });

  it('ADAY kaydırması ürün puanına GİRMEZ — ilgi beyanı satın alma beyanı değildir', async () => {
    await recordVote({ customerId: strangerId, productId: candidateId, context: 'candidate', vote: 'like' });
    await recordVote({ productId: candidateId, context: 'candidate', vote: 'like' }); // ziyaretçi

    // Aday evresinde toplanan savurmalar, ürün satışa geçtiğinde onu hiç kimse almamışken
    // yüksek puanlı gösterirdi. Aday sinyali kendi panosunda, kendi ağırlığıyla yaşar.
    expect(await getProductScore(candidateId)).toMatchObject({ average: null, totalCount: 0 });
    const board = (await listCandidateDemand()).find((row) => row.productId === candidateId);
    expect(board?.signal.rawLikes).toBe(2); // ikisi de panoda sayılır
    expect(board?.identifiedLikeCount).toBe(1); // ama yalnız biri KİŞİ
  });

  it('hiç beyanı olmayan ürün boş skor döner', async () => {
    expect(await getProductScore(otherProductId)).toMatchObject({ average: null, totalCount: 0 });
  });

  it('toplu okuma yalnız skoru olan ürünü haritaya koyar', async () => {
    await approvedReview(4);
    const scores = await getProductScores([productId, otherProductId]);
    expect(scores.get(productId)?.ratingAvg).toBe(4);
    expect(scores.has(otherProductId)).toBe(false);
  });
});

describe('aday ürün talep panosu', () => {
  it('kaydırmalar sayılır; kimlikli beğeniler AYRICA sayılır', async () => {
    await recordVote({ customerId: buyerId, productId: candidateId, context: 'candidate', vote: 'like', dwellMs: 3000 });
    await recordVote({ customerId: strangerId, productId: candidateId, context: 'candidate', vote: 'like', dwellMs: 1000 });
    await recordVote({ productId: candidateId, context: 'candidate', vote: 'like', dwellMs: 500 }); // ziyaretçi
    await recordVote({ productId: candidateId, context: 'candidate', vote: 'dislike' }); // ziyaretçi

    const demand = (await listCandidateDemand(50)).find((r) => r.productId === candidateId);
    // "Kaç kaydırma" ile "kaç KİŞİ" ayrı sorular: ziyaretçi tekilleştirilemez.
    expect(demand).toMatchObject({ dislikeCount: 1, identifiedLikeCount: 2 });
    expect(demand?.signal.rawLikes).toBe(3);
  });

  it('talebe göre sıralı liste aday ürünü içerir', async () => {
    await recordVote({ customerId: buyerId, productId: candidateId, context: 'candidate', vote: 'like' });
    expect((await listCandidateDemand(50)).some((r) => r.productId === candidateId)).toBe(true);
  });

  it('savurma beğenileri panoyu şişirmez — sıralama AĞIRLIKLI sayıya bakar', async () => {
    // Kartlara bakmadan geçilen altı kaydırma (ziyaretçi — tekilleştirilmez): ham sayı yüksek,
    // sinyal sıfır.
    for (let i = 0; i < 6; i += 1) {
      await recordVote({ productId: candidateId, context: 'candidate', vote: 'like', dwellMs: 80 });
    }
    const rows: CandidateDemandRow[] = await listCandidateDemand(50);
    const row = rows.find((r) => r.productId === candidateId);

    expect(row?.signal.rawLikes).toBe(6);
    // Hem süre hem desen sıfırlıyor: 6 beğeni, sıfır ağırlık.
    expect(row?.signal.weightedLikes).toBe(0);
    expect(row?.signal.trust).toBe(0);
  });

  it('bakarak ve ayırt ederek kaydıran kişinin beğenisi tam sayılır', async () => {
    await db.from('product_feedback').insert([
      { product_id: candidateId, customer_id: buyerId, context: 'candidate', vote: 'like', dwell_ms: 3000, status: 'approved' },
      { product_id: otherProductId, customer_id: buyerId, context: 'candidate', vote: 'dislike', dwell_ms: 2500, status: 'approved' },
    ]);
    const row = (await listCandidateDemand(50)).find((r) => r.productId === candidateId);
    expect(row?.signal.weightedLikes).toBe(1);
    expect(row?.identifiedLikeCount).toBe(1);
  });

  it('satılabilir ürünün değerlendirmesi panoya karışmaz', async () => {
    await approvedReview(5);
    expect((await listCandidateDemand(50)).some((r) => r.productId === productId)).toBe(false);
  });
});

describe('operasyon skor sıralaması', () => {
  it('en sevilen ve en sevilmeyen uçlardan okunur', async () => {
    await approvedReview(5);
    const best = await new ProductRatingService(db).listRanked('desc', 50);
    expect(best.some((r) => r.productId === productId)).toBe(true);
  });
});

describe('yorum yazma hakkı', () => {
  it('ziyaretçi yazamaz', async () => {
    expect(await getReviewEligibility(null, productId)).toEqual({ canReview: false, existing: null });
  });

  it('satın alan yazabilir; yazdıysa mevcut kaydı döner', async () => {
    expect(await getReviewEligibility(buyerId, productId)).toMatchObject({ canReview: true, existing: null });

    await submitReview({ customerId: buyerId, productId, language: 'tr', rating: 5 });
    const after = await getReviewEligibility(buyerId, productId);
    expect(after).toMatchObject({ canReview: true, existing: { rating: 5 } });
  });

  it('almamış müşteriye kapı kapalıdır', async () => {
    expect(await getReviewEligibility(strangerId, productId)).toMatchObject({ canReview: false });
  });
});
