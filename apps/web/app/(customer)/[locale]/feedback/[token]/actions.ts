'use server';

import { reviewFeedbackInvite, voteOnFeedbackInvite } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { hasLocale } from 'next-intl';
import type { FeedbackVote } from '@lezzet/types';
import { completeFeedbackInvite, type FeedbackCompletion } from '@/lib/feedback/invite';
import { customerErrorKey, CustomerError, type CustomerResult } from '@/lib/customer-error';
import { routing } from '@/i18n/routing';

/*
  Alım sonrası değerlendirmenin yazma kapıları; native ile aynı belirteçli kapılardan geçer. Kimlik belirteçten çözülür, istemciden
  alınmaz: davet e-postadan açılır, oturum yoktur ve kimlik parametre olsaydı başkasının adına yorum yazılabilirdi.
*/

/** Ürün oyu. Motorun iç retleri tek anahtara iner, çünkü kart listesi siparişten gelir ve müşteri düzeltemez. */
export async function voteAction(locale: string, token: string, productId: string, vote: FeedbackVote): Promise<CustomerResult<true>> {
  try {
    if (!hasLocale(routing.locales, locale)) throw new Error('Geçersiz dil');
    const outcome = await voteOnFeedbackInvite(serviceDb(), { token, productId, vote });
    if (outcome.status === 'invalid_link') return { data: null, errorKey: 'invalid_link' };
    if (outcome.status !== 'ok') return { data: null, errorKey: 'vote_failed' };
    return { data: true, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/** Bir ürünün yıldızı ve yorumu. Boş gövde ve kısa yorum müşterinin düzeltebileceği hâllerdir ve kendi anahtarlarıyla döner. */
export async function reviewAction(
  locale: string,
  token: string,
  productId: string,
  rating: number | null,
  comment: string | null,
): Promise<CustomerResult<true>> {
  try {
    if (!hasLocale(routing.locales, locale)) throw new Error('Geçersiz dil');
    const outcome = await reviewFeedbackInvite(serviceDb(), { token, productId, rating, comment });
    if (outcome.status === 'ok') return { data: true, errorKey: null };
    if (outcome.status === 'invalid_link') return { data: null, errorKey: 'invalid_link' };
    if (outcome.status === 'empty_review') return { data: null, errorKey: 'review_empty' };
    if (outcome.status === 'comment_too_short') return { data: null, errorKey: 'comment_too_short' };
    return { data: null, errorKey: 'vote_failed' };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/** Akışın tamamlanması: bitirme primi burada yazılır ve akış sonunu motor seçer. */
export async function completeAction(token: string): Promise<CustomerResult<FeedbackCompletion>> {
  try {
    const completion = await completeFeedbackInvite(token);
    if (!completion) throw new CustomerError('invalid_link');
    return { data: completion, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}
