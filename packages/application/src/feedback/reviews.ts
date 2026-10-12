import { ProductFeedbackService, ProductRatingService, UserProfileService } from '@lezzet/database';
import {
  EMPTY_PRODUCT_SCORE,
  productScoreOf,
  resolveUserText,
  reviewRatingRange,
  shortAuthorName,
  type ProductScore,
} from '@lezzet/domain-core';
import type { KeysetCursor, Page, PreferredLanguage, PublishedReview, ReviewRatingFilter, ReviewSummary } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Adı olmayan yazarın yerine basılan işaret; ad sonradan silinmiş profilde de yorum yayında kalır. */
const NO_AUTHOR = '—';

/** Tek ürünün skoru; hiç beyanı yoksa boş skor döner, `null` dolaşmaz. */
export async function getProductScore(db: SupabaseClient, productId: string): Promise<ProductScore> {
  const row = await new ProductRatingService(db).getByProduct(productId);
  return row ? productScoreOf(row) : EMPTY_PRODUCT_SCORE;
}

/** Listedeki ürünlerin skorları; haritada olmayan ürünün skoru yoktur, çağıran `?? EMPTY_PRODUCT_SCORE` okur. */
export async function getProductScores(db: SupabaseClient, productIds: readonly string[]): Promise<Map<string, ProductScore>> {
  if (productIds.length === 0) return new Map();
  const rows = await new ProductRatingService(db).listByProducts(productIds);
  return new Map(rows.map((row) => [row.productId, productScoreOf(row)]));
}

/** Skorun ekrana giden özeti. */
export function reviewSummaryOf(score: ProductScore): ReviewSummary {
  const [one, two, three, four, five] = score.ratingBreakdown;
  return {
    average: score.average,
    totalCount: score.totalCount,
    commentCount: score.commentCount,
    ratingBreakdown: [one, two, three, four, five],
  };
}

/**
 * Yayınlanmış yazılı yorumlar, en yeni önce ve keyset sayfalı; beğeni skora girer ama metinsiz kayıt burada görünmez.
 * `viewLanguage` zorunlu, çünkü varsayılan olsaydı dilini vermeyi unutan ekran herkese tek dil gösterir ve hata vermezdi.
 */
export async function listPublishedReviews(
  db: SupabaseClient,
  input: { productId: string; viewLanguage: PreferredLanguage; cursor?: KeysetCursor; limit?: number; rating?: ReviewRatingFilter },
): Promise<Page<PublishedReview>> {
  const range = input.rating === undefined ? undefined : reviewRatingRange(input.rating);
  const page = await new ProductFeedbackService(db).listPublishedComments(input.productId, input.cursor, input.limit, range);
  if (page.rows.length === 0) return { rows: [], nextCursor: page.nextCursor };

  const authorIds = page.rows.map((row) => row.customerId).filter((id): id is string => id !== null);
  const authors = await new UserProfileService(db).listByIds(authorIds);
  const nameById = new Map(authors.map((author) => [author.id, author.name]));

  return {
    rows: page.rows.map((row) => {
      const shown = resolveUserText({ text: row.comment, language: row.language, translations: row.translations }, input.viewLanguage);
      return {
        id: row.id,
        authorName: shortAuthorName(row.customerId === null ? null : nameById.get(row.customerId)) ?? NO_AUTHOR,
        rating: row.rating,
        vote: row.vote,
        comment: shown.text,
        commentTranslated: shown.isTranslated,
        language: row.language,
        originalComment: row.comment,
        createdAt: row.createdAt,
      };
    }),
    nextCursor: page.nextCursor,
  };
}
