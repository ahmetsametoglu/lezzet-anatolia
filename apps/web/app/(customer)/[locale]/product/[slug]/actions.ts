'use server';

import { hasLocale } from 'next-intl';
import { listPublishedReviews } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { KeysetCursorSchema, REVIEW_PAGE_SIZE, ReviewRatingFilterEnum } from '@lezzet/types';
import type { KeysetCursor, PreferredLanguage, PublishedReview, ReviewRatingFilter } from '@lezzet/types';
import { currentCustomerId } from '@/lib/guard';
import { CustomerError, customerErrorKey, type CustomerResult } from '@/lib/customer-error';
import { submitReview } from '@/lib/feedback/product-feedback';
import { routing } from '@/i18n/routing';

/**
 * Masaüstü ürün sayfasının yorum formu. Kimlik oturumdan çözülür; satın alma şartını ve yorumun alt sınırını kapının kendisi denetler.
 */
export async function submitReviewAction(input: {
  locale: string;
  productId: string;
  rating: number | null;
  comment: string;
}): Promise<CustomerResult<{ status: 'saved' }>> {
  try {
    if (!hasLocale(routing.locales, input.locale)) throw new Error('Geçersiz dil');
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');

    const result = await submitReview({
      customerId,
      productId: input.productId,
      rating: input.rating,
      comment: input.comment,
    });
    // Kapının reddi bir cevaptır; müşteriye giden yol tek olsun diye o da hata kapısından geçer.
    if (!result.ok) throw new CustomerError(reviewErrorKey(result.reason));
    return { data: { status: 'saved' }, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * Tüm yorumlar panelinin sayfaları; sayfa yeniden çizilseydi panel kapanırdı, bu yüzden yalnız satırlar gelir. İmleç ve süzgeç
 * istemciden gelir ama doğrulanır: biçimsiz değer sorguya girmez.
 */
export async function loadMoreReviewsAction(input: {
  locale: string;
  productId: string;
  /** İlk sayfada verilmez. */
  cursor?: unknown;
  /** Yıldız süzgeci; verilmezse tümü. */
  rating?: ReviewRatingFilter;
}): Promise<CustomerResult<{ reviews: PublishedReview[]; nextCursor: KeysetCursor | null }>> {
  try {
    if (!hasLocale(routing.locales, input.locale)) throw new Error('Geçersiz dil');
    let cursor: KeysetCursor | undefined;
    if (input.cursor !== undefined && input.cursor !== null) {
      const parsed = KeysetCursorSchema.safeParse(input.cursor);
      if (!parsed.success) throw new CustomerError('unexpected');
      cursor = parsed.data;
    }
    const rating = input.rating === undefined ? undefined : ReviewRatingFilterEnum.safeParse(input.rating);
    if (rating !== undefined && !rating.success) throw new CustomerError('unexpected');

    const page = await listPublishedReviews(serviceDb(), {
      productId: input.productId,
      viewLanguage: input.locale as PreferredLanguage,
      limit: REVIEW_PAGE_SIZE,
      ...(cursor === undefined ? {} : { cursor }),
      ...(rating === undefined ? {} : { rating: rating.data }),
    });
    return { data: { reviews: page.rows, nextCursor: page.nextCursor }, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/** Motorun ret sebebi ekranın anahtarına çevrilir; tanınmayan sebep jenerik cümleye düşer. */
function reviewErrorKey(reason: string): string {
  const map: Record<string, string> = {
    empty_review: 'review_empty',
    not_purchased: 'purchase_required',
    comment_too_short: 'comment_too_short',
  };
  return map[reason] ?? 'unexpected';
}
