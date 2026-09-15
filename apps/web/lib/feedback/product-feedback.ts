import 'server-only';
import {
  FeedbackRequestService,
  OrderItemService,
  OrderService,
  ProductFeedbackService,
  ProductRatingService,
  ProductService,
  ProductVariantService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import {
  EMPTY_PRODUCT_SCORE,
  candidateSignalOf,
  canModerate,
  dedupeBySwiper,
  initialFeedbackStatus,
  productScoreOf,
  resolveUserText,
  weighSwipesByProduct,
  type CandidateSignal,
  type ProductScore,
  type RawSwipe,
} from '@lezzet/domain-core';
import type {
  FeedbackContext,
  FeedbackVote,
  KeysetCursor,
  Page,
  PreferredLanguage,
  ProductFeedback,
  ReviewStatus,
  SourceLanguage,
} from '@lezzet/types';
import { awardFeedbackPoints } from './points';
import { logger } from '@lezzet/observability';

/**
 * Ürün geri bildirimi kapıları: motor karar verir, servis satır getirir, burası ikisini birleştirir.
 * `purchase` bağlamı satın almayı, `candidate` bağlamı adaylığı doğrular; bu yüzden ekranlar servisi değil bu dosyayı çağırır.
 */

export type FeedbackWriteResult<T> = { ok: true; data: T } | { ok: false; reason: string };

/**
 * Müşteri bu ürünü hangi siparişte aldı: teslim aranmaz, iptal ve taslak sayılmaz.
 * Görüş en son deneyime ait olduğu için en yeni uygun sipariş döner.
 */
async function findPurchase(customerId: string, productId: string): Promise<string | null> {
  const db = serviceDb();
  const orders = await new OrderService(db).listByCustomer(customerId, { limit: 100 });
  const usable = orders.rows.filter((o) => o.status !== 'cancelled' && o.status !== 'draft');
  if (usable.length === 0) return null;

  const items = await new OrderItemService(db).listByOrders(usable.map((o) => o.id));
  if (items.length === 0) return null;

  // Kalem varyanta bağlıdır, geri bildirim ürüne: aradaki eşleme varyant kayıtlarından çözülür.
  const variants = await new ProductVariantService(db).listByIds(items.map((i) => i.variantId));
  const variantsOfProduct = new Set(variants.filter((v) => v.productId === productId).map((v) => v.id));
  if (variantsOfProduct.size === 0) return null;

  const matched = new Set(items.filter((i) => variantsOfProduct.has(i.variantId)).map((i) => i.orderId));
  // `listByCustomer` yeniden eskiye sıralı — ilk eşleşen en yenisidir.
  return usable.find((o) => matched.has(o.id))?.id ?? null;
}

/**
 * Davet çağıranın mı: doğrulanmasa biri kendi yorumunu başkasının davetine yazıp onun ilerlemesini ve sonucunu bozabilirdi.
 * DB'de FK yok; geçersiz bağ sessizce düşürülür çünkü davet yorumun kendisi değil, bağlamıdır.
 */
async function ownedRequestId(customerId: string, feedbackRequestId: string | null | undefined): Promise<string | null> {
  if (!feedbackRequestId) return null;
  const request = await new FeedbackRequestService(serviceDb()).getById(feedbackRequestId);
  return request && request.customerId === customerId ? request.id : null;
}

/**
 * Varsa güncelle, yoksa aç; tekillik `(müşteri, ürün, bağlam)` üzerindedir.
 * Güncelleme kısmidir: yıldız, beğeni ve metin ayrı anlarda gelir ve verilmeyen alan öncekini silmemeli.
 */
async function upsertFeedback(input: {
  customerId: string;
  productId: string;
  context: FeedbackContext;
  orderId?: string | null;
  feedbackRequestId?: string | null;
  rating?: number | null;
  vote?: FeedbackVote | null;
  comment?: string | null;
  dwellMs?: number | null;
}): Promise<ProductFeedback> {
  const service = new ProductFeedbackService(serviceDb());
  const comment = input.comment?.trim() || null;
  // Metin varsa kuyruğa, yoksa doğrudan yayına — kural motorda (`initialFeedbackStatus`).
  const status = initialFeedbackStatus(comment);

  const existing = await service.findByCustomerProduct(input.customerId, input.productId, input.context);
  if (existing) {
    // Metin bu çağrıda GELDİ Mİ — "boş gönderdi" ile "bu çağrının konusu değil" ayrı şeyler.
    const touchesComment = input.comment !== undefined;
    return service.update({
      id: existing.id,
      ...(input.rating !== undefined ? { rating: input.rating } : {}),
      ...(input.vote !== undefined ? { vote: input.vote } : {}),
      ...(input.dwellMs !== undefined ? { dwellMs: input.dwellMs } : {}),
      // Metne dokunulmadıysa moderasyon durumu da olduğu gibi kalır: bir beğeni, onaylanmış bir yorumu yeniden kuyruğa sokmamalı.
      ...(touchesComment
        ? {
            comment,
            // Çeviri burada değil tetikleyicide sıfırlanır; değişen metin yeniden kuyruğa girer, yoksa onaylanmış metin sonradan değiştirilebilirdi.
            status,
            moderatedAt: null,
            moderatedBy: null,
          }
        : {}),
      orderId: input.orderId ?? existing.orderId,
      feedbackRequestId: input.feedbackRequestId ?? existing.feedbackRequestId,
    });
  }

  return service.insert({
    productId: input.productId,
    customerId: input.customerId,
    orderId: input.orderId ?? null,
    feedbackRequestId: input.feedbackRequestId ?? null,
    context: input.context,
    rating: input.rating ?? null,
    vote: input.vote ?? null,
    comment,
    dwellMs: input.dwellMs ?? null,
    status,
  });
}

/**
 * Yazılı yorum / yıldız, satın alınmış ürüne (`context='purchase'`).
 * Aynı ürüne bir müşteriden tek kayıt: aynı kişinin iki yıldızı ortalamayı iki kez etkilerdi.
 */
export async function submitReview(input: {
  customerId: string;
  productId: string;
  rating?: number | null;
  comment?: string | null;
  feedbackRequestId?: string | null;
}): Promise<FeedbackWriteResult<ProductFeedback>> {
  const comment = input.comment?.trim() || null;
  if (input.rating == null && !comment) return { ok: false, reason: 'empty_review' };

  const orderId = await findPurchase(input.customerId, input.productId);
  // Satın almayan yazamaz (DOMAIN §14) — doğrulanmamış yorum sosyal kanıt değil reklamdır.
  if (!orderId) return { ok: false, reason: 'not_purchased' };

  // Metin bu çağrının konusu değilse hiç geçirilmez — yalnız yıldız gönderen bir istek, daha önce yazılmış yorumu silmemeli.
  const saved = await upsertFeedback({
    ...input,
    ...(input.comment !== undefined ? { comment } : {}),
    feedbackRequestId: await ownedRequestId(input.customerId, input.feedbackRequestId),
    orderId,
    context: 'purchase',
  });
  // Puan SESSİZ yazılır: tavana takılmak ya da B2B olmak yorumu geri çevirmez (DOMAIN §14).
  await awardFeedbackPoints(saved);
  return { ok: true, data: saved };
}

/**
 * Beğen / geç: `purchase`ta satın alma, `candidate`ta ürünün adaylığı doğrulanır.
 * Ziyaretçi de kaydırabilir; kayıt kimliksiz düşer, aday panosuna sayılır ama puan doğurmaz ve tekilleştirilemez.
 */
export async function recordVote(input: {
  customerId?: string | null;
  productId: string;
  context: FeedbackContext;
  vote: FeedbackVote;
  dwellMs?: number | null;
  feedbackRequestId?: string | null;
}): Promise<FeedbackWriteResult<ProductFeedback | null>> {
  if (input.context === 'candidate') {
    const product = await new ProductService(serviceDb()).getById(input.productId);
    if (!product) return { ok: false, reason: 'not_found' };
    // Aday olmayan ürün keşif kartlarına düşmez; oradan gelen bir oy tutarsızdır.
    // Adaylık ayrı bir bayrak değil bir DURUMDUR (`product.status`): satılabilir ürün aynı anda aday olamaz.
    if (product.status !== 'candidate') return { ok: false, reason: 'not_candidate' };
  }

  if (!input.customerId) {
    // Kimliksiz kaydırma: güncellenecek bir "önceki" yok, doğrudan yazılır.
    const created = await new ProductFeedbackService(serviceDb()).insert({
      productId: input.productId,
      context: input.context,
      vote: input.vote,
      dwellMs: input.dwellMs ?? null,
      status: 'approved', // metin yok → okunacak bir şey yok
    });
    return { ok: true, data: created };
  }

  const feedbackRequestId = await ownedRequestId(input.customerId, input.feedbackRequestId);

  if (input.context === 'purchase') {
    const orderId = await findPurchase(input.customerId, input.productId);
    if (!orderId) return { ok: false, reason: 'not_purchased' };
    const saved = await upsertFeedback({ ...input, customerId: input.customerId, feedbackRequestId, orderId });
    await awardFeedbackPoints(saved);
    return { ok: true, data: saved };
  }

  const saved = await upsertFeedback({ ...input, customerId: input.customerId, feedbackRequestId });
  await awardFeedbackPoints(saved);
  return { ok: true, data: saved };
}

/** Müşterinin bu ürüne yazabilir mi ve yazdıysa ne — ürün sayfasındaki yorum panelinin girdisi. */
export async function getReviewEligibility(
  customerId: string | null,
  productId: string,
): Promise<{ canReview: boolean; existing: ProductFeedback | null }> {
  // Ziyaretçi yazamaz ve bunu öğrenmek için sipariş okumaya da gerek yok.
  if (!customerId) return { canReview: false, existing: null };
  const [existing, orderId] = await Promise.all([
    new ProductFeedbackService(serviceDb()).findByCustomerProduct(customerId, productId, 'purchase'),
    findPurchase(customerId, productId),
  ]);
  return { canReview: orderId !== null, existing };
}

/** Ürün sayfasında görünen yorum — yazarın adı ve OKUYUCUNUN DİLİ çözülmüş hâliyle. */
export interface PublishedReview {
  id: string;
  authorName: string;
  rating: number | null;
  /** Okuyucunun dilinde gösterilecek metin (çeviri yoksa orijinal). */
  comment: string | null;
  /** Gösterilen metin makine çevirisi mi — ekran bunu işaretlemeli ("otomatik çevrildi"). */
  commentTranslated: boolean;
  /** ORİJİNALİN dili — `lang` özniteliği ve "orijinali göster" için. `null` = tespit koşmadı. */
  language: SourceLanguage | null;
  /** Orijinal metin — ekran "orijinali göster" derse bunu basar; çeviri onun yerine GEÇMEZ. */
  originalComment: string | null;
  createdAt: string;
}

/**
 * Ürün sayfasının yorum listesi: yalnız yayınlanmış yazılı yorumlar, keyset sayfalı; beğeniler skora girer, burada görünmez.
 * `viewLanguage` bilerek zorunlu: varsayılan olsaydı dilini vermeyi unutan ekran herkese Türkçe gösterir ve hata vermezdi.
 */
export async function listProductReviews(
  productId: string,
  viewLanguage: PreferredLanguage,
  cursor?: KeysetCursor,
  limit?: number,
  /** Yıldız aralığı — panelin çipleri (`5★` tek değer, `3★ ve altı` aralık). Sunucuda süzülür. */
  rating?: { min?: number; max?: number },
): Promise<Page<PublishedReview>> {
  const db = serviceDb();
  const page = await new ProductFeedbackService(db).listPublishedComments(productId, cursor, limit, rating);
  if (page.rows.length === 0) return { rows: [], nextCursor: page.nextCursor };

  const authorIds = page.rows.map((r) => r.customerId).filter((id): id is string => id !== null);
  const authors = await new UserProfileService(db).listByIds(authorIds);
  const nameById = new Map(authors.map((a) => [a.id, a.name]));

  return {
    rows: page.rows.map((r) => {
      const gosterilen = resolveUserText({ text: r.comment, language: r.language, translations: r.translations }, viewLanguage);
      return {
        id: r.id,
        authorName: (r.customerId && nameById.get(r.customerId)) || '—',
        rating: r.rating,
        comment: gosterilen.text,
        commentTranslated: gosterilen.isTranslated,
        language: r.language,
        originalComment: r.comment,
        createdAt: r.createdAt,
      };
    }),
    nextCursor: page.nextCursor,
  };
}

/** Tek ürünün skoru — ürün detayı. Hiç beyanı yoksa boş skor (null dolaştırılmaz). */
export async function getProductScore(productId: string): Promise<ProductScore> {
  const row = await new ProductRatingService(serviceDb()).getByProduct(productId);
  return row ? productScoreOf(row) : EMPTY_PRODUCT_SCORE;
}

/**
 * Bir listedeki ürünlerin skorları — katalog kartları, "benzer ürünler", vitrin şeridi.
 * Haritada olmayan ürünün skoru yoktur; çağıran `?? EMPTY_PRODUCT_SCORE` okur.
 */
export async function getProductScores(productIds: readonly string[]): Promise<Map<string, ProductScore>> {
  if (productIds.length === 0) return new Map();
  const rows = await new ProductRatingService(serviceDb()).listByProducts(productIds);
  return new Map(rows.map((row) => [row.productId, productScoreOf(row)]));
}

/**
 * Ürünlerin sinyal kalitesi, `purchase` bağlamında: skor "ne kadar sevildi"yi, bu "bu sevgiye ne kadar güvenelim"i söyler ve tek tek kaydırmaları ister.
 * Ağırlık aday panosuyla aynı motor fonksiyonundan geçer; iki ekran aynı ürüne iki ayrı güven göstermesin.
 */
export async function getProductSignals(
  productIds: readonly string[],
  since?: string,
): Promise<Map<string, CandidateSignal>> {
  if (productIds.length === 0) return new Map();
  const rows = await new ProductFeedbackService(serviceDb()).listVotesByProducts(productIds, 'purchase', since);
  const byProduct = weighSwipesByProduct(rows.map(toRawSwipe));
  return new Map([...byProduct.entries()].map(([productId, swipes]) => [productId, candidateSignalOf(swipes)]));
}

/** Moderasyon kuyruğu (operasyon) — bekleyenler en eski önce; diğer hâller yeniden eskiye. */
export function listReviewsForModeration(status: ReviewStatus, cursor?: KeysetCursor, limit?: number): Promise<Page<ProductFeedback>> {
  const service = new ProductFeedbackService(serviceDb());
  return status === 'pending' ? service.listPending(cursor, limit) : service.listByStatus(status, cursor, limit);
}

/**
 * Onay / ret / geri çekme: izni motor verir (`canModerate`), damgayı servis basar.
 * Metinsiz kayıt moderasyona girmez ve metne dokunulmaz — bu kapının bir "düzenle" ikizi yok.
 */
export async function moderateReview(input: {
  reviewId: string;
  to: Exclude<ReviewStatus, 'pending'>;
  moderatorId: string;
}): Promise<FeedbackWriteResult<ProductFeedback>> {
  const service = new ProductFeedbackService(serviceDb());
  const row = await service.getById(input.reviewId);
  if (!row) return { ok: false, reason: 'not_found' };

  const check = canModerate(row.status, input.to, (row.comment?.trim().length ?? 0) > 0);
  if (!check.allowed) return { ok: false, reason: check.reason };

  return { ok: true, data: await service.moderate(row.id, input.to, input.moderatorId) };
}

/** Operasyon başlığındaki "N yorum onay bekliyor" rozeti. */
export function countPendingReviews(): Promise<number> {
  return new ProductFeedbackService(serviceDb()).countPending();
}

/** Aday panosunun tek satırı — ham talep + **ağırlıklı** sinyal yan yana. */
export interface CandidateDemandRow {
  productId: string;
  dislikeCount: number;
  /** Kaç KİŞİ beğendi (kimlikli) — "kaç kaydırma" ile aynı şey değil. */
  identifiedLikeCount: number;
  signal: CandidateSignal;
}

/**
 * Ağırlıklandırmanın okuduğu kaydırma sayısı; küme sınırsız büyür, pano en yenilerini sayar.
 * Sınıra dayanınca bunu söyler: sessiz kırpma "her şey sayıldı" diye okunur.
 */
const CANDIDATE_SAMPLE_SIZE = 5000;

/** DB satırı → motorun ham kaydırması; tek yerde, çünkü alan adları ayrışırsa (`customerId` ↔ `swiperId`) biri sessizce hep "kimliksiz" görürdü. */
const toRawSwipe = (row: ProductFeedback): RawSwipe => ({
  productId: row.productId,
  vote: row.vote,
  dwellMs: row.dwellMs,
  swiperId: row.customerId,
  at: row.createdAt,
});

/** Tekilleştirilmiş listede kimlikli beğeni sayısı — aday panosunun ve keşif kartının ortak "kaç kişi" ölçüsü. */
const identifiedLikes = (tekil: ReturnType<typeof dedupeBySwiper>): number =>
  tekil.filter((s) => s.vote === 'like' && s.swiperId).length;

/**
 * Aday ürün talep panosu, sinyal kalitesi ağırlıklı: ham beğeni sayısı yanıltır, her kaydırma süresi ve kaydıranın deseniyle tartılır.
 * Müşterinin puanı bundan etkilenmez; sıralama ağırlıklı sayıya göredir, ham sayı da yan yana taşınır.
 */
export async function listCandidateDemand(limit = 20, since?: string): Promise<CandidateDemandRow[]> {
  const db = serviceDb();
  const rows = await new ProductFeedbackService(db).listCandidateVotes(CANDIDATE_SAMPLE_SIZE, since);
  if (rows.length === 0) return [];
  if (rows.length === CANDIDATE_SAMPLE_SIZE) {
    logger.warn({ context: 'feedback/candidateBoard', sampleSize: CANDIDATE_SAMPLE_SIZE }, 'örneklem tavana dayandı; sıralama en yeni kaydırmalara göre');
  }

  // Ağırlık motorda; ürün skorunun güven kolonu da aynı fonksiyonu çağırır.
  const byProduct = weighSwipesByProduct(rows.map(toRawSwipe));

  return [...byProduct.entries()]
    .map(([productId, swipes]) => {
      // Üç sayı da aynı tekilleştirilmiş listeden türer; aynı kişinin aynı ürüne tekrarı hepsinde bir kez sayılır.
      const tekil = dedupeBySwiper(swipes);
      return {
        productId,
        dislikeCount: tekil.filter((s) => s.vote === 'dislike').length,
        identifiedLikeCount: identifiedLikes(tekil),
        signal: candidateSignalOf(tekil),
      };
    })
    .sort((a, b) => b.signal.weightedLikes - a.signal.weightedLikes)
    .slice(0, limit);
}

/** Aday ürünleri kaç kişinin beğendiği — keşif kartının "N kişi istedi" satırı, panoyla aynı ölçü. */
export async function countCandidateLikers(productIds: readonly string[]): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const rows = await new ProductFeedbackService(serviceDb()).listVotesByProducts(productIds, 'candidate');
  const byProduct = weighSwipesByProduct(rows.map(toRawSwipe));
  return new Map([...byProduct.entries()].map(([productId, swipes]) => [productId, identifiedLikes(dedupeBySwiper(swipes))]));
}
