import 'server-only';
import {
  FeedbackProgressService,
  FeedbackRequestService,
  OrderItemService,
  OrderService,
  OrderStatusLogService,
  ProductService,
  ProductVariantService,
  SettingsService,
  serviceDb,
} from '@lezzet/database';
import { FEEDBACK_DELAY_DAYS, feedbackOutcomeOf, feedbackToken, isDueForFeedback, type FeedbackOutcome } from '@lezzet/domain-core';
import { resolveLocalizedText, type FeedbackChannel, type FeedbackRequest, type ProductFeedback } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { publicImageUrl } from '@lezzet/storage';
import { ProductFeedbackService } from '@lezzet/database';
import { awardPoints, getPointsBalance } from './points';

/**
 * Alım-sonrası geri bildirim daveti (17.2) ve akış sonu (17.6) — uygulama kapıları.
 *
 * **Davet OLUŞTURULUR, sonra GÖNDERİLİR.** İki ayrı adım, çünkü iki ayrı gerçek: e-posta
 * sağlayıcısı düştüğünde davet kaybolmaz, gönderilmemiş olarak kuyrukta kalır ve sonraki tarama
 * onu bulur. Tek adım olsaydı sağlayıcı hatası daveti hiç var olmamış yapardı.
 */

/** Değerlendirme akışındaki tek kart — müşterinin aldığı bir ürün. */
export interface FeedbackCard {
  productId: string;
  name: string;
  imageUrl: string | null;
  /** Müşteri bu ürünü zaten değerlendirdiyse mevcut kaydı — akış kaldığı yerden devam eder. */
  existing: { vote: ProductFeedback['vote']; rating: number | null; comment: string | null } | null;
}

/** Davet açıldığında ekranın gördüğü her şey — tek turda. */
export interface FeedbackInviteView {
  requestId: string;
  customerId: string;
  orderReferenceNo: string | null;
  cards: FeedbackCard[];
  /** "2 / 5" — türetilir, saklanmaz. */
  progress: { rated: number; total: number };
  /** Tamamlanmış davet tekrar açılırsa: teşekkür durumu, puan ikinci kez verilmez. */
  completedAt: string | null;
  pointsAwarded: number | null;
}

/**
 * **Daveti hak eden siparişleri bulur ve davet açar** (17.2'nin tarama işi).
 *
 * Taramalı ve idempotent: sipariş başına tek davet (DB indeksi), zaten daveti olan atlanır. Cron
 * yoksa da elle çağrılabilir — zamanlayıcı bu işlevi tetikler, işin kendisi burada.
 *
 * Teslim anı `order_status_log`'dan TÜRETİLİR; siparişte `delivered_at` diye bir kolon yok ve
 * olmamalı (DATA_MODEL türetme ilkesi).
 */
export async function createDueFeedbackRequests(opts: { channel?: FeedbackChannel; limit?: number } = {}): Promise<FeedbackRequest[]> {
  const db = serviceDb();
  const orders = new OrderService(db);
  const logs = new OrderStatusLogService(db);
  const requests = new FeedbackRequestService(db);

  const delayDays = await new SettingsService(db).getNumber('feedback_delay_days', FEEDBACK_DELAY_DAYS);
  const candidates = await orders.listByStatus(['delivered', 'completed'], { limit: opts.limit ?? 200 });
  const created: FeedbackRequest[] = [];

  for (const order of candidates) {
    if (await requests.findByOrder(order.id)) continue; // zaten davet edilmiş
    const deliveredAt = await logs.firstEntryAt(order.id, 'delivered');
    if (!isDueForFeedback({ status: order.status, deliveredAt, delayDays })) continue;

    created.push(
      await requests.insert({
        orderId: order.id,
        customerId: order.customerId,
        token: feedbackToken(),
        channel: opts.channel ?? 'email',
      }),
    );
  }
  return created;
}

/** Gönderilmeyi bekleyen davetler — bildirim katmanı (14) bunları alıp yollar ve damgalar. */
export function listPendingInvites(limit?: number): Promise<FeedbackRequest[]> {
  return new FeedbackRequestService(serviceDb()).listUnsent(limit);
}

export function markInviteSent(id: string): Promise<FeedbackRequest> {
  return new FeedbackRequestService(serviceDb()).markSent(id);
}

/**
 * **Davetin açılması** — bağlantıdaki token'la. Akışın tek giriş kapısı.
 *
 * Token oturum yerine geçer; başka kimlik sorulmaz. Geçersiz token `null` döner — "böyle bir davet
 * var ama senin değil" demek, olmayan bir kaydın varlığını doğrulamaktır.
 *
 * **Yarıda bırakılan akış kaldığı yerden devam eder:** her kart mevcut değerlendirmesiyle gelir.
 */
export async function openFeedbackInvite(locale: Locale, token: string): Promise<FeedbackInviteView | null> {
  const db = serviceDb();
  const request = await new FeedbackRequestService(db).findByToken(token);
  if (!request) return null;

  const [order, items, progress, given] = await Promise.all([
    new OrderService(db).getById(request.orderId),
    new OrderItemService(db).listByOrder(request.orderId),
    new FeedbackProgressService(db).getByRequest(request.id),
    new ProductFeedbackService(db).listByRequest(request.id),
  ]);

  // Kalem varyanta bağlı, kart ürüne: aynı ürünün iki boyu TEK karttır.
  const variants = await new ProductVariantService(db).listByIds(items.map((i) => i.variantId));
  const productIds = [...new Set(variants.map((v) => v.productId))];
  const products = await new ProductService(db).listByIds(productIds);
  const givenByProduct = new Map(given.map((g) => [g.productId, g]));

  return {
    requestId: request.id,
    customerId: request.customerId,
    orderReferenceNo: order?.referenceNo ?? null,
    cards: products.map((product) => {
      const existing = givenByProduct.get(product.id);
      return {
        productId: product.id,
        name: resolveLocalizedText(product.name, locale),
        imageUrl: publicImageUrl(product.imageKey, product.imageUpdatedAt),
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
  /** Bu turda kazanılan puan; ikinci kez tamamlamada 0. */
  pointsAwarded: number;
  balance: number;
  /** Yalnız `google_review` sonucunda dolu. */
  googleReviewUrl: string | null;
}

/**
 * **Akışın tamamlanması** — puan burada verilir ve akış sonu belirlenir.
 *
 * **Puan tamamlamaya bağlıdır, beğeniye değil** (DOMAIN §14): müşteri her ürüne "beğenmedim" dese
 * de ödülünü alır. Arayüz bunun tersini ima bile etmemeli.
 *
 * İkinci çağrı puan vermez: `completedAt` damgası bunu söyler, defterdeki tekillik de ikinci bir
 * emniyet olarak durur.
 */
export async function completeFeedbackInvite(token: string): Promise<FeedbackCompletion | null> {
  const db = serviceDb();
  const requests = new FeedbackRequestService(db);
  const request = await requests.findByToken(token);
  if (!request) return null;

  const given = await new ProductFeedbackService(db).listByRequest(request.id);
  const likeCount = given.filter((g) => g.vote === 'like').length;
  const dislikeCount = given.filter((g) => g.vote === 'dislike').length;

  const googleUrl = (await new SettingsService(db).get<string>('google_review_url', '')) || null;
  const outcome = feedbackOutcomeOf({ likeCount, dislikeCount, hasGoogleLink: Boolean(googleUrl) });

  // Zaten tamamlanmış: teşekkür durumu gösterilir, puan İKİNCİ KEZ verilmez.
  if (request.completedAt) {
    return {
      outcome,
      pointsAwarded: 0,
      balance: (await getPointsBalance(request.customerId)).balance,
      googleReviewUrl: outcome === 'google_review' ? googleUrl : null,
    };
  }

  // Tamamlama puanı davetin KENDİSİNE yazılır: tek tek kartların puanı zaten kart başına verildi.
  const entry = await awardPoints({ customerId: request.customerId, reason: 'feedback_purchase', refId: request.id });
  const points = entry?.points ?? 0;
  await requests.markCompleted(request.id, points);

  return {
    outcome,
    pointsAwarded: points,
    balance: (await getPointsBalance(request.customerId)).balance,
    googleReviewUrl: outcome === 'google_review' ? googleUrl : null,
  };
}
