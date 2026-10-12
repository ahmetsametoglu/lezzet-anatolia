'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import type { KeysetCursor, PublishedReview, ReviewRatingFilter } from '@lezzet/types';
import { loadMoreReviewsAction } from '../actions';

interface ReviewPages {
  reviews: PublishedReview[];
  /** Sonraki sayfa var mı; `null` liste bitti demek. */
  cursor: KeysetCursor | null;
  loading: boolean;
  failed: boolean;
  /** İlk sayfa geldi mi; "hiç yorum yok" ancak ondan sonra söylenebilir. */
  loaded: boolean;
  /** `null` = tümü. */
  filter: ReviewRatingFilter | null;
  setFilter: (filter: ReviewRatingFilter | null) => void;
  /** Sonraki sayfayı ister; sürmekte olan istek varken ya da liste bittiyse bir şey yapmaz. */
  loadMore: () => void;
  /** Düşen isteği aynı yerden yeniden dener. */
  retry: () => void;
}

/** Tüm yorumlar panelinin sayfaları; masaüstü modalı ve telefon sayfası aynı yüklemeyi kullanır, yalnız çizimleri ayrıdır. */
export function useReviewPages(locale: Locale, productId: string): ReviewPages {
  const [reviews, setReviews] = useState<PublishedReview[]>([]);
  const [cursor, setCursor] = useState<KeysetCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<ReviewRatingFilter | null>(null);
  // Süzgeç değişince sürmekte olan eski isteğin cevabı yeni kümenin üstüne yazılmaz.
  const generation = useRef(0);

  const load = useCallback(
    async (from: KeysetCursor | null, key: ReviewRatingFilter | null) => {
      const run = from === null ? (generation.current += 1) : generation.current;
      setLoading(true);
      setFailed(false);
      const result = await loadMoreReviewsAction({
        locale,
        productId,
        ...(from === null ? {} : { cursor: from }),
        ...(key === null ? {} : { rating: key }),
      });
      if (run !== generation.current) return;
      if (result.data) {
        const page = result.data;
        // İmleçsiz çağrı listeyi baştan kurar, imleçli çağrı ekler; yeni süzgeç yeni bir kümedir.
        setReviews((prev) => (from === null ? page.reviews : [...prev, ...page.reviews]));
        setCursor(page.nextCursor);
      } else {
        // Liste yarım kalırsa müşteri yorumların bittiğini sanardı; düşen bir okuma olduğu için tekrar denenebilir.
        setFailed(true);
      }
      setLoading(false);
      setLoaded(true);
    },
    [locale, productId],
  );

  useEffect(() => {
    void load(null, filter);
  }, [load, filter]);

  const loadMore = useCallback(() => {
    if (cursor !== null && !loading && !failed) void load(cursor, filter);
  }, [cursor, failed, filter, load, loading]);
  const retry = useCallback(() => void load(cursor, filter), [cursor, filter, load]);

  return { reviews, cursor, loading, failed, loaded, filter, setFilter, loadMore, retry };
}
