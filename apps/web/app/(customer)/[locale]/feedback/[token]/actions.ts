'use server';

import { FeedbackRequestService, serviceDb } from '@lezzet/database';
import { hasLocale } from 'next-intl';
import type { FeedbackVote } from '@lezzet/types';
import { recordVote, submitReview } from '@/lib/feedback/product-feedback';
import { completeFeedbackInvite, type FeedbackCompletion } from '@/lib/feedback/invite';
import { customerErrorKey, CustomerError, type CustomerResult } from '@/lib/customer-error';
import { routing } from '@/i18n/routing';

/**
 * Alım-sonrası değerlendirme akışının yazma kapıları (08.7 · 17.2).
 *
 * **KİMLİK TOKEN'DAN ÇÖZÜLÜR, İSTEMCİDEN ALINMAZ — bu dosyanın tek önemli kuralı.**
 *
 * Yüzeyin geri kalanında kimlik oturumdan gelir (`currentCustomerId`); burada oturum YOK, çünkü
 * davet e-postadan tıklanır ve müşteriden giriş yapması istenmiyor (tasarım: "akıcılık
 * bozulmamalı"). O yüzden `customerId` parametre olarak kabul edilseydi, tarayıcı konsolundan
 * gönderilen bir kimlikle **başkasının adına yorum yazılabilirdi**. Token oturumun yerine geçer:
 * her eylem önce `findByToken` ile daveti çözer, kimliği ORADAN alır.
 *
 * İkinci kat koruma motorda: `submitReview`/`recordVote` satın almayı doğruluyor (`findPurchase`)
 * ve `ownedRequestId` davetin o müşteriye ait olduğunu kontrol ediyor. Yani geçerli bir token'la
 * bile sipariş dışı bir ürüne oy verilemiyor — tasarımın "sipariş dışı ürünler değerlendirmeye
 * sokulmaz" kuralı burada veriyle korunuyor, ekranın kart listesiyle değil.
 *
 * Geçersiz token `invalid_link` döner: "böyle bir davet var ama senin değil" demek, olmayan bir
 * kaydın varlığını doğrulamaktır (`openFeedbackInvite` künyesiyle aynı gerekçe).
 */

/** Token → davet. Üç action da buradan geçer; kimliğin tek kaynağı bu. */
async function resolveInvite(token: string): Promise<{ customerId: string; requestId: string }> {
  const request = await new FeedbackRequestService(serviceDb()).findByToken(token);
  if (!request) throw new CustomerError('invalid_link');
  return { customerId: request.customerId, requestId: request.id };
}

/** Kart oyu (👍/👎). Motorun `purchase` bağlamı satın almayı ayrıca doğrular. */
export async function voteAction(locale: string, token: string, productId: string, vote: FeedbackVote): Promise<CustomerResult<true>> {
  try {
    if (!hasLocale(routing.locales, locale)) throw new Error('Geçersiz dil');
    const { customerId, requestId } = await resolveInvite(token);

    const result = await recordVote({ customerId, productId, context: 'purchase', vote, feedbackRequestId: requestId });
    // Motorun iç sebebi müşteriye ANLATILMAZ: `not_purchased` sistemin iç yapısını söyler ve zaten
    // müşterinin düzeltebileceği bir şey değil — kart listesi siparişten geliyor, bu hâl ancak
    // veriyle oynanırsa doğar.
    if (!result.ok) return { data: null, errorKey: 'vote_failed' };
    return { data: true, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * İsteğe bağlı yıldız + yazılı yorum.
 *
 * Dil davetin dilinden geçiyor: yorum hangi dilde yazıldıysa o dille saklanmalı, yoksa moderasyon
 * kuyruğunda okunamayan bir metin belirir ve ürün sayfasında yanlış dile düşer.
 */
export async function reviewAction(
  locale: string,
  token: string,
  productId: string,
  rating: number | null,
  comment: string | null,
): Promise<CustomerResult<true>> {
  try {
    if (!hasLocale(routing.locales, locale)) throw new Error('Geçersiz dil');
    const { customerId, requestId } = await resolveInvite(token);

    const result = await submitReview({ customerId, productId, language: locale, rating, comment, feedbackRequestId: requestId });
    // `empty_review` GERÇEK bir kullanıcı hatası ve ayrı cümleyi hak ediyor: müşteri "kaydet"e
    // bastı ama ne yıldız ne metin var. Öbür sebepler (satın almamış) tek anahtara iner.
    if (!result.ok) return { data: null, errorKey: result.reason === 'empty_review' ? 'review_empty' : 'vote_failed' };
    return { data: true, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * Akışın tamamlanması — puan burada verilir ve akış sonu (Google daveti / sorun köprüsü) belirlenir.
 *
 * Sonucu MOTOR söyler (`feedbackOutcomeOf`), ekran değil: "memnun mu" kararı beğeni ORANINA bakan
 * bir eşiktir ve istemcide sayılsaydı iki yerde iki farklı memnuniyet tanımı olurdu. Ekranın işi
 * dönen `outcome`'a göre doğru kutuyu çizmek.
 */
export async function completeAction(token: string): Promise<CustomerResult<FeedbackCompletion>> {
  try {
    const completion = await completeFeedbackInvite(token);
    if (!completion) throw new CustomerError('invalid_link');
    return { data: completion, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}
