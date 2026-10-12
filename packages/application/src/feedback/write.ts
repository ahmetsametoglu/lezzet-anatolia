import {
  FeedbackRequestService,
  OrderItemService,
  OrderService,
  ProductFeedbackService,
  ProductVariantService,
  SettingsService,
} from '@lezzet/database';
import { REVIEW_MIN_WORDS_DEFAULT, REVIEW_MIN_WORDS_KEY, initialFeedbackStatus, meetsReviewMinimum } from '@lezzet/domain-core';
import type { FeedbackVote, ProductFeedback } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { awardFeedbackPoints } from './points';

/*
  Belirteçli değerlendirme yazımı: web davet sayfası ve native ekran aynı kapılardan yazar. Kimlik belirteçten çözülür, çağırandan
  alınmaz; alınsaydı istemciden gönderilen bir kimlikle başkasının adına yorum yazılabilirdi.
*/

export type FeedbackWriteOutcome =
  | { status: 'ok'; feedback: ProductFeedback }
  | { status: 'invalid_link' | 'not_purchased' | 'empty_review' | 'comment_too_short' };

/**
 * Müşterinin bu ürünü aldığı en yeni sipariş. Teslim aranmaz, satın alma yeter; iptal ve taslak sayılmaz, çünkü orada alışveriş
 * gerçekleşmemiştir.
 */
async function findPurchase(db: SupabaseClient, customerId: string, productId: string): Promise<string | null> {
  const orders = await new OrderService(db).listByCustomer(customerId, { limit: 100 });
  const usable = orders.rows.filter((o) => o.status !== 'cancelled' && o.status !== 'draft');
  if (usable.length === 0) return null;

  const items = await new OrderItemService(db).listByOrders(usable.map((o) => o.id));
  if (items.length === 0) return null;

  // Kalem varyanta bağlıdır, geri bildirim ürüne; eşleme varyant kayıtlarından çözülür.
  const variants = await new ProductVariantService(db).listByIds(items.map((i) => i.variantId));
  const variantsOfProduct = new Set(variants.filter((v) => v.productId === productId).map((v) => v.id));
  if (variantsOfProduct.size === 0) return null;

  const matched = new Set(items.filter((i) => variantsOfProduct.has(i.variantId)).map((i) => i.orderId));
  // `listByCustomer` yeniden eskiye sıralı; ilk eşleşen en yenisidir.
  return usable.find((o) => matched.has(o.id))?.id ?? null;
}

/**
 * Varsa günceller, yoksa açar; güncelleme kısmidir. Oy ve yorum ayrı anlarda gelir ve verilmeyen alan yazılsaydı ikinci çağrı
 * birincisini silerdi.
 */
async function upsertFeedback(
  db: SupabaseClient,
  input: {
    customerId: string;
    productId: string;
    orderId: string;
    feedbackRequestId: string;
    rating?: number | null;
    vote?: FeedbackVote | null;
    comment?: string | null;
  },
): Promise<ProductFeedback> {
  const service = new ProductFeedbackService(db);
  const comment = input.comment?.trim() || null;
  const status = initialFeedbackStatus(comment);

  const existing = await service.findByCustomerProduct(input.customerId, input.productId, 'purchase');
  if (existing) {
    const touchesComment = input.comment !== undefined;
    return service.update({
      id: existing.id,
      ...(input.rating !== undefined ? { rating: input.rating } : {}),
      ...(input.vote !== undefined ? { vote: input.vote } : {}),
      // Metne dokunulmayan yazım moderasyon durumunu korur; bir oy onaylanmış yorumu yeniden kuyruğa sokmamalı.
      ...(touchesComment ? { comment, status, moderatedAt: null, moderatedBy: null } : {}),
      orderId: input.orderId ?? existing.orderId,
      feedbackRequestId: input.feedbackRequestId ?? existing.feedbackRequestId,
    });
  }

  return service.insert({
    productId: input.productId,
    customerId: input.customerId,
    orderId: input.orderId,
    feedbackRequestId: input.feedbackRequestId,
    context: 'purchase',
    rating: input.rating ?? null,
    vote: input.vote ?? null,
    comment,
    status,
  });
}

/** Belirteç → davet; kimliğin tek kaynağı. */
async function resolveInvite(db: SupabaseClient, token: string): Promise<{ customerId: string; requestId: string } | null> {
  const request = await new FeedbackRequestService(db).findByToken(token);
  return request ? { customerId: request.customerId, requestId: request.id } : null;
}

/** Ürün oyu. Satın almayan oy veremez; puan sessiz yazılır, tavan ya da B2B oyu geri çevirmez. */
export async function voteOnFeedbackInvite(
  db: SupabaseClient,
  input: { token: string; productId: string; vote: FeedbackVote },
): Promise<FeedbackWriteOutcome> {
  const invite = await resolveInvite(db, input.token);
  if (!invite) return { status: 'invalid_link' };

  const orderId = await findPurchase(db, invite.customerId, input.productId);
  if (!orderId) return { status: 'not_purchased' };

  const saved = await upsertFeedback(db, {
    customerId: invite.customerId,
    productId: input.productId,
    orderId,
    feedbackRequestId: invite.requestId,
    vote: input.vote,
  });
  await awardFeedbackPoints(db, saved);
  return { status: 'ok', feedback: saved };
}

/** Yorum ayardaki alt sınırın altında mı; yorum yazan her kapı bunu sorar, çünkü yorum puan getirir ve boşlukla geçilmemeli. */
export async function reviewCommentTooShort(db: SupabaseClient, comment: string): Promise<boolean> {
  const minWords = await new SettingsService(db).getNumber(REVIEW_MIN_WORDS_KEY, REVIEW_MIN_WORDS_DEFAULT);
  return !meetsReviewMinimum(comment, minWords);
}

/** Ürünün yıldızı ve yazılı yorumu; alt sınırın altındaki yorum kaydedilmez. */
export async function reviewFeedbackInvite(
  db: SupabaseClient,
  input: { token: string; productId: string; rating?: number | null; comment?: string | null },
): Promise<FeedbackWriteOutcome> {
  const comment = input.comment?.trim() || null;
  if (input.rating == null && !comment) return { status: 'empty_review' };
  if (comment !== null && (await reviewCommentTooShort(db, comment))) return { status: 'comment_too_short' };

  const invite = await resolveInvite(db, input.token);
  if (!invite) return { status: 'invalid_link' };

  const orderId = await findPurchase(db, invite.customerId, input.productId);
  if (!orderId) return { status: 'not_purchased' };

  // Gönderilmeyen metin geçirilmez; yalnız yıldız gönderen istek önceki yorumu silmemeli.
  const saved = await upsertFeedback(db, {
    customerId: invite.customerId,
    productId: input.productId,
    orderId,
    feedbackRequestId: invite.requestId,
    ...(input.rating !== undefined ? { rating: input.rating } : {}),
    ...(input.comment !== undefined ? { comment } : {}),
  });
  await awardFeedbackPoints(db, saved);
  return { status: 'ok', feedback: saved };
}
