'use server';

import { claimDiscoverSwipes, recordDiscoverSwipe } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import type { FeedbackVote } from '@lezzet/types';
import { currentCustomerId } from '@/lib/guard';
import { customerErrorKey, type CustomerResult } from '@/lib/customer-error';

/**
 * Keşif akışının yazma kapıları; kimlik sunucuda çözülür, çünkü ekranın "girişliyim" bilgisi güvenilmezdi. Girişsizde kaydırma
 * kimliksiz yazılır.
 */

/**
 * Bir kart kaydırması; dönen kimliği ziyaretçinin tarayıcısı saklar ki tur giriş sonrası hesaba bağlansın. `dwellMs` sinyal
 * kalitesinin girdisidir, puanı etkilemez.
 */
export async function swipeAction(
  productId: string,
  vote: FeedbackVote,
  dwellMs: number,
): Promise<CustomerResult<{ feedbackId: string | null; pointsAwarded: number | null; balance: number | null }>> {
  try {
    const customerId = await currentCustomerId();
    const result = await recordDiscoverSwipe(serviceDb(), { customerId, productId, vote, dwellMs });
    // Motorun iç sebebi müşteriye anlatılmaz: düzeltebileceği bir şey değil.
    if (result.status !== 'ok') return { data: null, errorKey: 'swipe_failed' };
    const { id, pointsAwarded, balance } = result.swipe;
    return { data: { feedbackId: id, pointsAwarded, balance }, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * Girişten sonra turu hesaba bağlar; girişsizde boş döner, çünkü kapı kimliği kendisi çözer.
 */
export async function claimSwipesAction(feedbackIds: string[]): Promise<CustomerResult<{ linked: number; points: number }>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) return { data: { linked: 0, points: 0 }, errorKey: null };
    return { data: await claimDiscoverSwipes(serviceDb(), customerId, feedbackIds), errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}
