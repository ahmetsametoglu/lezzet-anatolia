'use server';

import type { FeedbackVote } from '@lezzet/types';
import { recordVote } from '@/lib/feedback/product-feedback';
import { claimDiscoverSwipes } from '@/lib/feedback/discover-claim';
import { currentCustomerId } from '@/lib/guard';
import { customerErrorKey, type CustomerResult } from '@/lib/customer-error';

/**
 * Keşif akışının yazma kapıları (08.7 · 17.3).
 *
 * **Kimlik SUNUCUDA çözülür, istemciden alınmaz** — yüzeyin her yerinde olduğu gibi. Girişsizde
 * `currentCustomerId` `null` döner ve kaydırma kimliksiz yazılır; ekranın "girişli miyim" bilgisini
 * göndermesine gerek yok, zaten güvenilmezdi.
 */

/**
 * Bir kart kaydırması. Dönen kimlik ziyaretçinin tarayıcısında saklanır — turu sonradan hesaba
 * bağlayacak olan o (`discover-store`). Girişli müşteride kimlik döner ama kullanılmaz: puanı
 * `recordVote` zaten anında yazdı.
 *
 * `dwellMs` sinyal KALİTESİNİN girdisi (`signal-quality`: 400 ms altı kart görülmemiş sayılır) —
 * müşterinin puanını etkilemez (ödül ≠ güven, DOMAIN §14). Ekran ölçer, motor değerlendirir.
 */
export async function swipeAction(
  productId: string,
  vote: FeedbackVote,
  dwellMs: number,
): Promise<CustomerResult<{ feedbackId: string | null }>> {
  try {
    const customerId = await currentCustomerId();
    const result = await recordVote({ customerId, productId, context: 'candidate', vote, dwellMs });
    // Motorun iç sebebi müşteriye anlatılmaz (`not_candidate` sistemin iç yapısını söyler ve
    // müşterinin düzeltebileceği bir şey değil — kart listesi zaten sunucudan geldi).
    if (!result.ok) return { data: null, errorKey: 'swipe_failed' };
    return { data: { feedbackId: result.data?.id ?? null }, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * Girişten sonra turu hesaba bağlar. Girişsizde sessizce boş döner — kapı kimliği kendisi
 * çözdüğü için ekranın "artık girişliyim" iddiasına güvenilmiyor.
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
