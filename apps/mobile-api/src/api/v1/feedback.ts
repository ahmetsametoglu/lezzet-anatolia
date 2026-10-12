import { Hono } from 'hono';
import type { z } from 'zod';
import { serviceDb } from '@lezzet/database';
import {
  completeFeedbackInvite,
  openFeedbackInvite,
  reviewFeedbackInvite,
  voteOnFeedbackInvite,
} from '@lezzet/application';
import {
  FeedbackAckSchema,
  FeedbackCompletionSchema,
  FeedbackInviteSchema,
  FeedbackReviewBodySchema,
  FeedbackVoteBodySchema,
  PreferredLanguageEnum,
} from '@lezzet/types';
import type { AppEnv } from '../../context';
import { fail, ok } from '../../lib/respond';

/**
 * Alım sonrası davetin mobil uçları. Belirteç kimliğin kendisidir: davet e-postadan açılır ve giriş istenmez, kimlik her istekte
 * sunucuda belirteçten çözülür; geçersiz belirteç `invalid_link` 404 döner, çünkü "var ama senin değil" demek kaydı doğrulamaktır.
 */
export const feedback = new Hono<AppEnv>();

/** Davetin açılması; `locale` zorunlu, çünkü kart adları sunucuda çözülür ve sessizce Türkçeye düşmek gizli bir arızadır. */
feedback.get('/feedback/:token', async (c) => {
  const locale = PreferredLanguageEnum.safeParse(c.req.query('locale'));
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  const invite = await openFeedbackInvite(serviceDb(), locale.data, c.req.param('token'));
  if (!invite || invite.cards.length === 0) return fail(c, 'invalid_link', 404);

  // Gövde `z.input` ile tiplenir ki görünüm sözleşmeden saparsa derlenmesin; `parse` görünümün kimlik alanlarını da süzer.
  const body: z.input<typeof FeedbackInviteSchema> = invite;
  return ok(c, FeedbackInviteSchema.parse(body));
});

/** Ürün oyu, anında yazılır. Motorun iç retleri tek anahtara iner, çünkü kart listesi siparişten gelir ve müşteri düzeltemez. */
feedback.post('/feedback/:token/vote', async (c) => {
  const body = FeedbackVoteBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const outcome = await voteOnFeedbackInvite(serviceDb(), { token: c.req.param('token'), ...body.data });
  if (outcome.status === 'invalid_link') return fail(c, 'invalid_link', 404);
  if (outcome.status !== 'ok') return fail(c, 'vote_failed', 400);
  return ok(c, FeedbackAckSchema.parse({ recorded: true }));
});

/** Bir ürünün yorumu. Boş gövde ve kısa yorum müşterinin düzeltebileceği hâllerdir ve kendi anahtarlarıyla döner. */
feedback.post('/feedback/:token/review', async (c) => {
  const body = FeedbackReviewBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const outcome = await reviewFeedbackInvite(serviceDb(), { token: c.req.param('token'), ...body.data });
  if (outcome.status === 'invalid_link') return fail(c, 'invalid_link', 404);
  if (outcome.status === 'empty_review') return fail(c, 'review_empty', 400);
  if (outcome.status === 'comment_too_short') return fail(c, 'comment_too_short', 400);
  if (outcome.status !== 'ok') return fail(c, 'vote_failed', 400);
  return ok(c, FeedbackAckSchema.parse({ recorded: true }));
});

/**
 * Akışın tamamlanması: bitirme primi burada yazılır, akış sonunu motor seçer. Turun toplamı da buradan çıkar, çünkü oy ve yorum
 * uçları puanı söylemez ve ekran toplasa motoru taklit etmiş olurdu.
 */
feedback.post('/feedback/:token/complete', async (c) => {
  const completion = await completeFeedbackInvite(serviceDb(), c.req.param('token'));
  if (!completion) return fail(c, 'invalid_link', 404);

  const body: z.input<typeof FeedbackCompletionSchema> = completion;
  return ok(c, FeedbackCompletionSchema.parse(body));
});
