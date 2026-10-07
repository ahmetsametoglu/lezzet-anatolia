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
import { feedbackOutcomeOf, type FeedbackOutcome } from '@lezzet/domain-core';
import { resolveLocalizedText, type PreferredLanguage, type ProductFeedback } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { imageOf } from '../catalog/map';
import type { StorefrontImage } from '../catalog/storefront-types';
import { awardPoints, feedbackCompletionPoints, getPointsBalance, sumInvitePoints } from './points';

/*
  Alım sonrası değerlendirme daveti: web sayfası ve native ekran aynı akışı buradan açar. Belirteç oturum yerine geçer; geçersiz ya da
  süresi dolmuş belirteç `null` döner, çünkü "var ama senin değil" demek olmayan bir kaydı doğrulamak olurdu.
*/

/** Değerlendirme akışındaki tek kart — müşterinin aldığı bir ürün. */
export interface FeedbackCard {
  productId: string;
  name: string;
  image: StorefrontImage;
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
  /** Tamamlanmış davet tekrar açılırsa: teşekkür durumu, puan ikinci kez verilmez. */
  completedAt: string | null;
  pointsAwarded: number | null;
}

/**
 * **Davetin açılması** — bağlantıdaki token'la. Akışın tek giriş kapısı.
 *
 * **Yarıda bırakılan akış kaldığı yerden devam eder:** her kart mevcut değerlendirmesiyle gelir;
 * ekran ilk OYSUZ karttan sürer (ölçüt `existing` değil `existing.vote` — yalnız yorum taşıyan
 * kart hâlâ cevapsızdır).
 */
export async function openFeedbackInvite(
  db: SupabaseClient,
  locale: PreferredLanguage,
  token: string,
): Promise<FeedbackInviteView | null> {
  const request = await new FeedbackRequestService(db).findByToken(token);
  if (!request) return null;

  const [order, items, progress, given, customer, completionPoints] = await Promise.all([
    new OrderService(db).getById(request.orderId),
    new OrderItemService(db).listByOrder(request.orderId),
    new FeedbackProgressService(db).getByRequest(request.id),
    new ProductFeedbackService(db).listByRequest(request.id),
    new UserProfileService(db).getById(request.customerId),
    // Sözün sayısı ayardan; ekran kendi rakamını uydurmaz. Varsayılan `points.ts`te TEK yerde.
    feedbackCompletionPoints(db),
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
    completionPoints,
    cards: products.map((product) => {
      const existing = givenByProduct.get(product.id);
      return {
        productId: product.id,
        name: resolveLocalizedText(product.name, locale),
        image: imageOf(product),
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

/** Siparişin AÇIK değerlendirme daveti — sipariş ekranının teşvik bloğunun tek kaynağı. */
export interface OrderFeedbackInvite {
  /** Akışın anahtarı; ekran `/feedback/[token]`e bununla gider (oturum yerine geçer). */
  token: string;
  /** Tamamlamanın kazandıracağı puan — AYARDAN, ekran sayı uydurmaz (`FeedbackInviteView` künyesi). */
  completionPoints: number;
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
  return { token: request.token, completionPoints: await feedbackCompletionPoints(db) };
}
