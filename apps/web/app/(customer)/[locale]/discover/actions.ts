'use server';

import type { FeedbackVote } from '@lezzet/types';
import { recordVote } from '@/lib/feedback/product-feedback';
import { claimDiscoverSwipes } from '@/lib/feedback/discover-claim';
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
): Promise<CustomerResult<{ feedbackId: string | null }>> {
  try {
    const customerId = await currentCustomerId();
    const result = await recordVote({ customerId, productId, context: 'candidate', vote, dwellMs });
    // Motorun iç sebebi müşteriye anlatılmaz: düzeltebileceği bir şey değil.
    if (!result.ok) return { data: null, errorKey: 'swipe_failed' };
    return { data: { feedbackId: result.data?.id ?? null }, errorKey: null };
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
    return { data: await claimDiscoverSwipes(customerId, feedbackIds), errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}
