import {
  FeedbackProgressService,
  FeedbackRequestService,
  OrderItemService,
  OrderService,
  ProductFeedbackService,
  ProductService,
  ProductVariantService,
  SettingsService,
  UserProfileService,
} from '@lezzet/database';
import {
  POINTS_SETTING_KEYS,
  REVIEW_MIN_WORDS_DEFAULT,
  REVIEW_MIN_WORDS_KEY,
  feedbackOutcomeOf,
  type FeedbackOutcome,
} from '@lezzet/domain-core';
import { resolveLocalizedText, type OrderItem, type PreferredLanguage, type ProductFeedback, type ProductVariant } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { imageOf } from '../catalog/map';
import type { StorefrontImage } from '../catalog/storefront-types';
import { POINTS_DEFAULTS, awardPoints, feedbackCompletionPoints, getPointsBalance, sumInvitePoints } from './points';

/*
  Alım sonrası değerlendirme daveti: web sayfası ve native ekran aynı akışı buradan açar. Belirteç oturum yerine geçer; geçersiz ya da
  süresi dolmuş belirteç `null` döner, çünkü "var ama senin değil" demek olmayan bir kaydı doğrulamak olurdu.
*/

/** Değerlendirme akışındaki tek kart — müşterinin aldığı bir ürün. */
export interface FeedbackCard {
  productId: string;
  name: string;
  image: StorefrontImage;
  /** Ürünün siparişteki boyları ve adetleri ("6 adet · 225 g · ×1"); aynı ürünün iki boyu tek kartta yan yana yazılır. */
  detail: string;
  /** Müşteri bu ürünü zaten değerlendirdiyse mevcut kaydı — akış kaldığı yerden devam eder. */
  existing: { vote: ProductFeedback['vote']; rating: number | null; comment: string | null } | null;
}

/** Davet açıldığında ekranın gördüğü her şey — tek turda. */
export interface FeedbackInviteView {
  requestId: string;
  customerId: string;
  /** Talep akışının siparişe bağlanması için (`/support/new?order=`). */
  orderId: string;
  /** Karşılama ve teşekkür ekranı adla hitap ediyor ("Teşekkürler Ayşe Hanım!"). Yoksa genel cümle. */
  customerName: string | null;
  /** vFb başlık rozeti ("LZA-2417") ve web karşılaması bunu basıyor. */
  orderReferenceNo: string | null;
  /** Siparişin tarihi — ham ISO, biçimleme ekranın (dil orada belli). */
  orderedOn: string | null;
  cards: FeedbackCard[];
  /** "2 / 5" — türetilir, saklanmaz (`feedback_request_progress` görünümü). */
  progress: { rated: number; total: number };
  /** Tamamlamanın kazandıracağı puan ayardan gelir (`points_feedback_purchase`); ekran sayı uydurmaz, ayar değişince yanlış söz verirdi. */
  completionPoints: number;
  /** Oylanan her ürünün puanı; ekran kural satırında söyler. */
  votePoints: number;
  /** Yorum yazılan her ürünün puanı; ekran yorum alanının rozetinde söyler. */
  reviewPoints: number;
  /** Puan getiren yorumun en az kelime sayısı; ekran uyarıyı bununla kurar, kararı yazım kapısı verir. */
  reviewMinWords: number;
  /** Tamamlanmış davet tekrar açılırsa: teşekkür durumu, puan ikinci kez verilmez. */
  completedAt: string | null;
  pointsAwarded: number | null;
}

/** Akışın müşteriye söylediği sayılar ayardan okunur, çünkü ekranın söylediği puan motorun yazdığıyla aynı olmalı. */
async function feedbackTerms(db: SupabaseClient): Promise<{ votePoints: number; reviewPoints: number; reviewMinWords: number }> {
  const settings = new SettingsService(db);
  const [votePoints, reviewPoints, reviewMinWords] = await Promise.all([
    feedbackCompletionPoints(db),
    settings.getNumber(POINTS_SETTING_KEYS.review, POINTS_DEFAULTS.review),
    settings.getNumber(REVIEW_MIN_WORDS_KEY, REVIEW_MIN_WORDS_DEFAULT),
  ]);
  return { votePoints, reviewPoints, reviewMinWords };
}

/** Kartın alt satırı; boy etiketi yoksa yalnız adet yazılır. */
function cardDetail(
  productId: string,
  items: readonly OrderItem[],
  variants: readonly ProductVariant[],
  locale: PreferredLanguage,
): string {
  const lines: string[] = [];
  for (const item of items) {
    const variant = variants.find((v) => v.id === item.variantId);
    if (variant?.productId !== productId) continue;
    const label = resolveLocalizedText(variant.label, locale);
    lines.push(label ? `${label} · ×${item.qty}` : `×${item.qty}`);
  }
  return lines.join(', ');
}

/** Davetin açılması; her kart mevcut cevabıyla gelir ki yarıda bırakılan akış kaldığı yerden sürsün. */
export async function openFeedbackInvite(
  db: SupabaseClient,
  locale: PreferredLanguage,
  token: string,
): Promise<FeedbackInviteView | null> {
  const request = await new FeedbackRequestService(db).findByToken(token);
  if (!request) return null;

  const [order, items, progress, given, customer, terms] = await Promise.all([
    new OrderService(db).getById(request.orderId),
    new OrderItemService(db).listByOrder(request.orderId),
    new FeedbackProgressService(db).getByRequest(request.id),
    new ProductFeedbackService(db).listByRequest(request.id),
    new UserProfileService(db).getById(request.customerId),
    feedbackTerms(db),
  ]);

  // Kalem varyanta bağlı, kart ürüne: aynı ürünün iki boyu TEK karttır.
  const variants = await new ProductVariantService(db).listByIds(items.map((i) => i.variantId));
  const productIds = [...new Set(variants.map((v) => v.productId))];
  const products = await new ProductService(db).listByIds(productIds);
  const givenByProduct = new Map(given.map((g) => [g.productId, g]));

  return {
    requestId: request.id,
    customerId: request.customerId,
    orderId: request.orderId,
    customerName: customer?.name ?? null,
    orderReferenceNo: order?.referenceNo ?? null,
    orderedOn: order?.createdAt ?? null,
    completionPoints: terms.votePoints,
    ...terms,
    cards: products.map((product) => {
      const existing = givenByProduct.get(product.id);
      return {
        productId: product.id,
        name: resolveLocalizedText(product.name, locale),
        image: imageOf(product),
        detail: cardDetail(product.id, items, variants, locale),
        existing: existing ? { vote: existing.vote, rating: existing.rating, comment: existing.comment } : null,
      };
    }),
    progress: { rated: progress?.ratedProducts ?? 0, total: progress?.totalProducts ?? 0 },
    completedAt: request.completedAt,
    pointsAwarded: request.pointsAwarded,
  };
}

export interface FeedbackCompletion {
  outcome: FeedbackOutcome;
  /** Bu ÇAĞRININ yazdığı puan (tamamlama primi); ikinci kez tamamlamada 0. Turun toplamı bu değil. */
  pointsAwarded: number;
  /**
   * Bu davete yazılmış toplam puan: oylar, yorum ve tamamlama primi (`sumInvitePoints`). İstemci toplamaz, çünkü motoru taklit etmek
   * olurdu; ikinci tamamlamada prim 0'a düşse de bu alan turun toplamını söyler.
   */
  invitePointsTotal: number;
  balance: number;
  /** Yalnız `review_invite` sonucunda dolu — dış değerlendirme adresi ve düğmede yazacak ad. */
  reviewUrl: string | null;
  reviewPlatform: string | null;
}

/**
 * Akışın tamamlanması: puan burada verilir ve akış sonu belirlenir; puan beğeniye değil tamamlamaya bağlıdır (DOMAIN §14). İkinci
 * çağrı puan vermez: `completedAt` damgası ve defterdeki tekillik bunu korur.
 */
export async function completeFeedbackInvite(db: SupabaseClient, token: string): Promise<FeedbackCompletion | null> {
  const requests = new FeedbackRequestService(db);
  const request = await requests.findByToken(token);
  if (!request) return null;

  const given = await new ProductFeedbackService(db).listByRequest(request.id);
  const likeCount = given.filter((g) => g.vote === 'like').length;
  const dislikeCount = given.filter((g) => g.vote === 'dislike').length;

  // Hangi platform olduğu buranın kararı DEĞİL, ayarın: Google İşletme Profili de Trustpilot da
  // aynı uca takılır (`review_platform_url`). Motor yalnız "bağlantı var mı"yı sorar.
  const settings = new SettingsService(db);
  const reviewUrl = (await settings.get<string>('review_platform_url', '')) || null;
  const outcome = feedbackOutcomeOf({ likeCount, dislikeCount, hasReviewLink: Boolean(reviewUrl) });
  const invite =
    outcome === 'review_invite'
      ? { reviewUrl, reviewPlatform: await settings.get<string>('review_platform_name', 'Google') }
      : { reviewUrl: null, reviewPlatform: null };

  // Turun puan kayıtlarının KAYNAKLARI: tamamlama primi davetin kendisine, kart puanları (oy ve
  // yorum) o davetin geri bildirim satırlarına yazılır — defterdeki `ref_id` bu kümeden çıkar.
  const roundRefIds = [request.id, ...given.map((g) => g.id)];

  // Zaten tamamlanmış: teşekkür durumu gösterilir, puan İKİNCİ KEZ verilmez. Turun TOPLAMI yine de
  // dolu döner — "bu çağrı ne verdi" ile "bu tur ne kazandırdı" ayrı sorular.
  if (request.completedAt) {
    const [balance, invitePointsTotal] = await Promise.all([
      getPointsBalance(db, request.customerId),
      sumInvitePoints(db, { customerId: request.customerId, refIds: roundRefIds, since: request.createdAt }),
    ]);
    return { outcome, pointsAwarded: 0, invitePointsTotal, balance: balance.balance, ...invite };
  }

  // Tamamlama puanı davetin KENDİSİNE yazılır: tek tek kartların puanı zaten kart başına verildi.
  const entry = await awardPoints(db, { customerId: request.customerId, reason: 'feedback_purchase', refId: request.id });
  const points = entry?.points ?? 0;
  await requests.markCompleted(request.id, points);

  // Toplam ve bakiye YAZIMDAN SONRA okunur: primin kaydı ikisine de girmeli.
  const [balance, invitePointsTotal] = await Promise.all([
    getPointsBalance(db, request.customerId),
    sumInvitePoints(db, { customerId: request.customerId, refIds: roundRefIds, since: request.createdAt }),
  ]);
  return { outcome, pointsAwarded: points, invitePointsTotal, balance: balance.balance, ...invite };
}

/** Siparişin açık değerlendirme daveti — sipariş ekranının teşvik bloğunun tek kaynağı. */
export interface OrderFeedbackInvite {
  /** Akışın anahtarı; ekran `/feedback/[token]`e bununla gider (oturum yerine geçer). */
  token: string;
  /** Oylanan her ürünün puanı; teşvik metni akıştaki kural satırıyla aynı sayıları söyler. */
  votePoints: number;
  /** Yorum yazılan her ürünün puanı. */
  reviewPoints: number;
}

/**
 * Siparişten açık davete giden yol: sipariş ekranındaki yorum teşviki bununla bağlanır, çünkü yorum daveti bildirimi sipariş
 * sayfasına götürür. `null` davetin hiç olmadığını, tamamlandığını ya da süresinin dolduğunu söyler; ekran üçünde de blok çizmez.
 */
export async function readOrderFeedbackInvite(db: SupabaseClient, orderId: string): Promise<OrderFeedbackInvite | null> {
  const request = await new FeedbackRequestService(db).findByOrder(orderId);
  if (!request || request.completedAt !== null) return null;
  // Süresi dolmuş token akışı açmaz (`openFeedbackInvite` da reddeder); teşvik onu vaat etmemeli.
  if (Date.parse(request.expiresAt) <= Date.now()) return null;
  const { votePoints, reviewPoints } = await feedbackTerms(db);
  return { token: request.token, votePoints, reviewPoints };
}
