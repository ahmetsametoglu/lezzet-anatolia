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
  initialFeedbackStatus,
  productScoreOf,
  swipeWeight,
  type CandidateSignal,
  type ProductScore,
} from '@lezzet/domain-core';
import type { FeedbackContext, FeedbackVote, KeysetCursor, Page, PreferredLanguage, ProductFeedback, ReviewStatus } from '@lezzet/types';
import { awardFeedbackPoints } from './points';

/**
 * Ürün geri bildirimi kapıları (17.1, 17.3) — motor karar verir, servisler satır getirir, burası
 * ikisini birleştirir.
 *
 * **İki bağlam, iki kapı** ve bu ayrım yalnız burada uygulanabilir:
 *   · `purchase`  → müşteri o ürünü gerçekten almış olmalı. Veritabanı bunu zorlayamaz (siparişin
 *     kalemlerine bakmak gerekir), motor da bilemez (sipariş okuması ister).
 *   · `candidate` → ürün gerçekten aday olmalı. Satın alma aranmaz ve aranamaz: aday ürün henüz
 *     satılmıyor.
 *
 * Kapıdan geçmeyen bir yazma yolu açılmadığı sürece kural sızdırmaz — bu yüzden servis doğrudan
 * çağrılmaz, ekranlar bu dosyayı çağırır.
 */

export type FeedbackWriteResult<T> = { ok: true; data: T } | { ok: false; reason: string };

/**
 * Müşteri bu ürünü gerçekten aldı mı — ve hangi siparişte.
 *
 * **Teslim edilmiş olması aranmaz, satın alınmış olması yeter.** Sipariş yolda diye görüşünü
 * yazamayan müşteri unutur; asıl kayıp odur. Ama iptal edilmiş ve taslak sipariş sayılmaz: orada
 * bir alışveriş hiç gerçekleşmemiştir.
 *
 * En YENİ uygun sipariş döner — görüş en son deneyime aittir.
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
 * Davet çağırandan gelir — **onun daveti mi.**
 *
 * Doğrulanmasaydı A, kendi yorumunu B'nin `feedbackRequestId`'siyle yazabilirdi: kayıt B'nin
 * davetine düşer, B akışı açtığında A'nın metnini "senin değerlendirmen" diye görür, "2/5"
 * ilerlemesi şişer ve akış sonu kararının (`feedbackOutcomeOf`) beğeni sayımı bozulur. DB'de FK
 * bile yok; tek denetim yeri burası. Geçersiz bağ **sessizce düşürülür** — davet bir bağlamdır,
 * yorumun kendisini geri çevirmesi orantısız olurdu.
 */
async function ownedRequestId(customerId: string, feedbackRequestId: string | null | undefined): Promise<string | null> {
  if (!feedbackRequestId) return null;
  const request = await new FeedbackRequestService(serviceDb()).getById(feedbackRequestId);
  return request && request.customerId === customerId ? request.id : null;
}

/**
 * Ortak yazım: varsa güncelle, yoksa aç. Tekillik `(müşteri, ürün, bağlam)` üzerindedir.
 *
 * **Güncelleme KISMİDİR — verilmeyen alan silinmez.** Tek satırda üç beyan yaşayabiliyor (yıldız,
 * beğeni, metin) ve bunlar ayrı anlarda gelir: müşteri önce 👍 der, iki gün sonra yorum yazar.
 * Her alanı `?? null` ile yazsaydık ikinci çağrı birincisini siler; beğeni ürün puanından düşer,
 * ya da tersinde onaylanmış yorum metni yok olurdu. Motorun "ikisi bir arada yaşar" vaadi
 * (`points.ts` — iki ayrı puan satırı) tam da bu yüzden yazımda da tutulmalı.
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
  language?: PreferredLanguage | null;
  dwellMs?: number | null;
}): Promise<ProductFeedback> {
  const service = new ProductFeedbackService(serviceDb());
  const comment = input.comment?.trim() || null;
  // Metin varsa kuyruğa, yoksa doğrudan yayına — kural motorda (`initialFeedbackStatus`).
  const status = initialFeedbackStatus(comment);
  // Dil METNİN dilidir: metin yoksa taşınacak bir dil de yoktur (DB kısıtı da bunu zorlar).
  const language = comment ? (input.language ?? null) : null;

  const existing = await service.findByCustomerProduct(input.customerId, input.productId, input.context);
  if (existing) {
    // Metin bu çağrıda GELDİ Mİ — "boş gönderdi" ile "bu çağrının konusu değil" ayrı şeyler.
    const touchesComment = input.comment !== undefined;
    return service.update({
      id: existing.id,
      ...(input.rating !== undefined ? { rating: input.rating } : {}),
      ...(input.vote !== undefined ? { vote: input.vote } : {}),
      ...(input.dwellMs !== undefined ? { dwellMs: input.dwellMs } : {}),
      // Metne dokunulmadıysa moderasyon durumu da olduğu gibi kalır: bir beğeni, onaylanmış bir
      // yorumu yeniden kuyruğa sokmamalı — okunacak yeni bir şey yok.
      ...(touchesComment
        ? {
            comment,
            language,
            // Değişen metin yeniden kuyruğa girer: onaylanmış metni sonradan değiştirebilmek
            // moderasyonu tamamen anlamsız kılardı.
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
    language,
    dwellMs: input.dwellMs ?? null,
    status,
  });
}

/**
 * **Yazılı yorum / yıldız** — satın alınmış ürüne (`context='purchase'`).
 *
 * Aynı ürüne bir müşteriden tek kayıt: ikinci kez alan müşteri görüşünü günceller — aynı kişinin
 * iki yıldızı ortalamayı iki kez etkilerdi.
 */
export async function submitReview(input: {
  customerId: string;
  productId: string;
  language: PreferredLanguage;
  rating?: number | null;
  comment?: string | null;
  feedbackRequestId?: string | null;
}): Promise<FeedbackWriteResult<ProductFeedback>> {
  const comment = input.comment?.trim() || null;
  if (input.rating == null && !comment) return { ok: false, reason: 'empty_review' };

  const orderId = await findPurchase(input.customerId, input.productId);
  // Satın almayan yazamaz (DOMAIN §14) — doğrulanmamış yorum sosyal kanıt değil reklamdır.
  if (!orderId) return { ok: false, reason: 'not_purchased' };

  // Metin bu çağrının konusu değilse hiç geçirilmez — yalnız yıldız gönderen bir istek, daha önce
  // yazılmış (ve onaylanmış) yorumu silmemeli.
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
 * **Beğen / geç** — iki bağlamda da aynı mekanizma (17.3).
 *
 * `purchase`: alım-sonrası ankette aldığı ürünü değerlendirir → satın alma doğrulanır.
 * `candidate`: keşif bölümünde aday ürünü kaydırır → ürünün aday olduğu doğrulanır.
 *
 * **Ziyaretçi de kaydırabilir** (`customerId` yok): kayıt kimliksiz düşer, aday panosuna sayılır
 * ama puan doğurmaz ve tekilleştirilemez — tekilleştirmek kimlik tutmayı gerektirirdi.
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
    // Adaylık ayrı bir bayrak değil bir DURUMDUR (`product.status`): satılabilir ürün aynı anda
    // aday olamaz — ikisi aynı eksenin iki değeridir.
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

/** Ürün sayfasında görünen yorum — yazarın adı çözülmüş hâliyle. */
export interface PublishedReview {
  id: string;
  authorName: string;
  rating: number | null;
  comment: string | null;
  language: PreferredLanguage | null;
  createdAt: string;
}

/**
 * Ürün sayfasının yorum listesi — **yalnız yayınlanmış YAZILI** yorumlar, keyset sayfalı.
 *
 * Beğeniler burada görünmez: onlar okunacak değil sayılacak şeylerdir, skora girerler.
 */
export async function listProductReviews(productId: string, cursor?: KeysetCursor, limit?: number): Promise<Page<PublishedReview>> {
  const db = serviceDb();
  const page = await new ProductFeedbackService(db).listPublishedComments(productId, cursor, limit);
  if (page.rows.length === 0) return { rows: [], nextCursor: page.nextCursor };

  const authorIds = page.rows.map((r) => r.customerId).filter((id): id is string => id !== null);
  const authors = await new UserProfileService(db).listByIds(authorIds);
  const nameById = new Map(authors.map((a) => [a.id, a.name]));

  return {
    rows: page.rows.map((r) => ({
      id: r.id,
      authorName: (r.customerId && nameById.get(r.customerId)) || '—',
      rating: r.rating,
      comment: r.comment,
      language: r.language,
      createdAt: r.createdAt,
    })),
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
 *
 * Haritada olmayan ürünün skoru yoktur; çağıran `?? EMPTY_PRODUCT_SCORE` okur. Tüm ürünler için
 * boş kayıt üretmek, 200 ürünlük bir katalogda 200 gereksiz nesne olurdu.
 */
export async function getProductScores(productIds: readonly string[]): Promise<Map<string, ProductScore>> {
  if (productIds.length === 0) return new Map();
  const rows = await new ProductRatingService(serviceDb()).listByProducts(productIds);
  return new Map(rows.map((row) => [row.productId, productScoreOf(row)]));
}

/** Moderasyon kuyruğu (operasyon) — bekleyenler en eski önce; diğer hâller yeniden eskiye. */
export function listReviewsForModeration(status: ReviewStatus, cursor?: KeysetCursor, limit?: number): Promise<Page<ProductFeedback>> {
  const service = new ProductFeedbackService(serviceDb());
  return status === 'pending' ? service.listPending(cursor, limit) : service.listByStatus(status, cursor, limit);
}

/**
 * Onay / ret / geri çekme. İzni motor verir (`canModerate`), damgayı servis basar.
 *
 * **Metinsiz kayıt moderasyona girmez** (`nothing_to_read`): bir yıldızı ya da beğeniyi reddetmek
 * anlamsızdır. Metne DOKUNULMAZ — bu kapının bir "düzenle" ikizi yok ve olmayacak.
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
 * **Aday ürün talep panosu, sinyal kalitesi ağırlıklı** (13.4 · 17.3 · DOMAIN §14).
 *
 * Ham beğeni sayısı panoda yanıltıcıdır: 40 savurma beğenisi 8 gerçek beğeniden büyük görünür.
 * Burada her kaydırma kendi ağırlığıyla sayılır — kartta geçirilen süre ve kaydıranın deseni
 * (hep aynı yöne savuran bilgi taşımaz).
 *
 * **Müşterinin puanı bundan ETKİLENMEZ** (DOMAIN §14 "ödül ≠ güven"): kalitesiz kaydırma da
 * ödülünü almıştır, yalnız iş kararını bozmaz.
 *
 * Sıralama ağırlıklı sayıya göredir; ham sayı da taşınır ki ekran ikisini yan yana gösterebilsin.
 */
/**
 * Ağırlıklandırmanın okuduğu kaydırma sayısı. Küme sınırsız büyür (ziyaretçi kaydırması
 * tekilleştirilmiyor); pano en YENİ bu kadarını sayar. Sınıra dayanıldığında ekran bunu söyler —
 * sessiz kırpma "her şey sayıldı" diye okunur.
 */
const CANDIDATE_SAMPLE_SIZE = 5000;

export async function listCandidateDemand(limit = 20): Promise<CandidateDemandRow[]> {
  const db = serviceDb();
  const rows = await new ProductFeedbackService(db).listCandidateVotes(CANDIDATE_SAMPLE_SIZE);
  if (rows.length === 0) return [];
  if (rows.length === CANDIDATE_SAMPLE_SIZE) {
    console.warn(`[aday panosu] örneklem tavana dayandı (${CANDIDATE_SAMPLE_SIZE}); sıralama en yeni kaydırmalara göre.`);
  }

  // Kaydıranın deseni: kimlik başına beğeni/geçme sayıları. Kimliksiz kaydırmalar tek bir havuzda
  // toplanamaz — hangisinin aynı kişi olduğu bilinmiyor; onlar için desen ağırlığı uygulanmaz.
  const byCustomer = new Map<string, { like: number; dislike: number }>();
  for (const row of rows) {
    if (!row.customerId || !row.vote) continue;
    const tally = byCustomer.get(row.customerId) ?? { like: 0, dislike: 0 };
    if (row.vote === 'like') tally.like += 1;
    else tally.dislike += 1;
    byCustomer.set(row.customerId, tally);
  }

  const byProduct = new Map<string, Array<{ vote: 'like' | 'dislike'; weight: number }>>();
  const dislikes = new Map<string, number>();
  const identified = new Map<string, number>();

  for (const row of rows) {
    if (!row.vote) continue;
    const tally = row.customerId ? byCustomer.get(row.customerId) : undefined;
    const weight = swipeWeight({
      dwellMs: row.dwellMs,
      // Kimliksiz kaydırmada desen çıkarılamaz: nötr (dengeli) kabul edilir.
      swiperLikeCount: tally?.like ?? 1,
      swiperDislikeCount: tally?.dislike ?? 1,
    });
    byProduct.set(row.productId, [...(byProduct.get(row.productId) ?? []), { vote: row.vote, weight }]);
    if (row.vote === 'dislike') dislikes.set(row.productId, (dislikes.get(row.productId) ?? 0) + 1);
    if (row.vote === 'like' && row.customerId) identified.set(row.productId, (identified.get(row.productId) ?? 0) + 1);
  }

  return [...byProduct.entries()]
    .map(([productId, swipes]) => ({
      productId,
      dislikeCount: dislikes.get(productId) ?? 0,
      identifiedLikeCount: identified.get(productId) ?? 0,
      signal: candidateSignalOf(swipes),
    }))
    .sort((a, b) => b.signal.weightedLikes - a.signal.weightedLikes)
    .slice(0, limit);
}
