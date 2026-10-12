import { useCallback, useEffect, useRef, useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import type { PublishedReview, ReviewRatingFilter, ReviewSummary } from '@lezzet/types';

import { fetchProductReviews } from '@/lib/api/catalog';

/*
  Tüm yorumlar ekranının verisi, sipariş listesinin sayfalama deseniyle: imleç saklanır ve aynen geri verilir, kuyruk hatası listeyi
  düşürmez. Süzgeç değişince liste baştan kurulur ama eski satırlar yeni sayfa gelene kadar durur, ki ekran boşalıp dolmasın.
*/

/** İlk yükün hâlleri: `missing` uç 404 dedi (ürün satışta değil), `error` telin arızası. */
type ProductReviewsStatus = 'loading' | 'ready' | 'missing' | 'error';

interface UseProductReviewsResult {
  status: ProductReviewsStatus;
  productName: string;
  summary: ReviewSummary | null;
  reviews: PublishedReview[];
  /** `null` = tümü. */
  filter: ReviewRatingFilter | null;
  setFilter: (filter: ReviewRatingFilter | null) => void;
  /** Süzgecin ilk sayfası ya da kuyruk yükleniyor. */
  loadingMore: boolean;
  /** Son istek düştü; liste yerinde, devamı gelmedi. */
  tailFailed: boolean;
  loadMore: () => void;
  /** İlk yükü ya da düşen son isteği yeniden dener. */
  retry: () => void;
}

export function useProductReviews(slug: string, locale: Locale): UseProductReviewsResult {
  const [status, setStatus] = useState<ProductReviewsStatus>('loading');
  const [productName, setProductName] = useState('');
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [reviews, setReviews] = useState<PublishedReview[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filter, setFilterState] = useState<ReviewRatingFilter | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tailFailed, setTailFailed] = useState(false);
  /** Kaçıncı yükün geçerli olduğu; süzgeç değişince eski cevap yeni kümenin üstüne yazılmaz. */
  const generation = useRef(0);

  const loadFirst = useCallback(
    async (nextFilter: ReviewRatingFilter | null, initial: boolean) => {
      const run = (generation.current += 1);
      if (initial) setStatus('loading');
      else setLoadingMore(true);
      setTailFailed(false);

      const result = await fetchProductReviews(slug, locale, nextFilter === null ? {} : { rating: nextFilter });
      if (run !== generation.current) return;
      setLoadingMore(false);

      if (result.error !== null) {
        if (initial) {
          setStatus(result.status === 404 ? 'missing' : 'error');
          return;
        }
        // Süzgecin ilk sayfası gelmediyse eski kümenin satırları yeni çipin altında kalmaz.
        setReviews([]);
        setCursor(null);
        setTailFailed(true);
        return;
      }
      setProductName(result.data.productName);
      setSummary(result.data.summary);
      setReviews(result.data.rows);
      setCursor(result.data.nextCursor);
      setStatus('ready');
    },
    [locale, slug],
  );

  useEffect(() => {
    void loadFirst(null, true);
  }, [loadFirst]);

  const setFilter = useCallback(
    (next: ReviewRatingFilter | null) => {
      setFilterState(next);
      void loadFirst(next, false);
    },
    [loadFirst],
  );

  const loadMore = useCallback(() => {
    // `FlatList` sonu cömertçe bildirir; liste bittiyse ya da istek sürüyorsa kuyruk istenmez.
    if (cursor === null || loadingMore || status !== 'ready') return;
    const run = generation.current;
    setLoadingMore(true);
    setTailFailed(false);
    void fetchProductReviews(slug, locale, { cursor, ...(filter === null ? {} : { rating: filter }) }).then((result) => {
      if (run !== generation.current) return;
      setLoadingMore(false);
      if (result.error !== null) {
        setTailFailed(true);
        return;
      }
      setReviews((current) => [...current, ...result.data.rows]);
      setCursor(result.data.nextCursor);
    });
  }, [cursor, filter, loadingMore, locale, slug, status]);

  const retry = useCallback(() => {
    if (status !== 'ready') void loadFirst(filter, true);
    else if (cursor === null) void loadFirst(filter, false);
    else loadMore();
  }, [cursor, filter, loadFirst, loadMore, status]);

  return { status, productName, summary, reviews, filter, setFilter, loadingMore, tailFailed, loadMore, retry };
}
