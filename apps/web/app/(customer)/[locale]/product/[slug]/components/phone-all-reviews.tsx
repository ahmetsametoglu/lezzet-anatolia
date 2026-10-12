'use client';

import { useEffect, useRef } from 'react';
import { reviewFilterCount, type ProductScore } from '@lezzet/domain-core';
import { formatDecimal, ratingCountLabel } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import productMessages from '@lezzet/i18n/customer/product';
import { ReviewRatingFilterEnum, type ReviewRatingFilter } from '@lezzet/types';
import { Chip } from '@/components/customer/phone-kit/chip';
import { FunnelHeader } from '@/components/customer/ui/funnel-header';
import { Icon } from '@/components/customer/ui/icons';
import { PhoneReviewCard, PhoneStars } from './phone-review-card';
import { useReviewPages } from './use-review-pages.hook';

interface PhoneAllReviewsProps {
  locale: Locale;
  productId: string;
  productName: string;
  /** Ürünün tamamının skoru; ortalama, sayı ve dağılım buradan okunur, yüklenmiş sayfadan değil. */
  score: ProductScore;
  /** Yazılı yorum sayısı; "Tümü" çipinin sayısı. */
  total: number;
}

/**
 * Tüm yorumlar sayfası (tasarım 17t): puan özeti, yıldız dağılımı, süzgeç çipleri ve aşağı kaydırdıkça yüklenen liste. Ürün sayfasını
 * terk etmez, çünkü ayrı rotadan dönüşte sayfa baştan çizilir ve müşteri seçtiği boyu kaybederdi.
 */
export function PhoneAllReviews({ locale, productId, productName, score, total }: PhoneAllReviewsProps) {
  const product = productMessages[locale];
  const copy = product.reviews;
  const { reviews, cursor, loading, failed, loaded, filter, setFilter, loadMore, retry } = useReviewPages(locale, productId);
  const breakdown = score.ratingBreakdown;
  const countOf = (key: ReviewRatingFilter | null) => (key === null ? total : reviewFilterCount(breakdown, key));
  // Sayısı sıfır olan çip çizilmez: basılınca boş liste gösteren çip müşteriye kendi dokunuşunu sorgulatır.
  const chips: (ReviewRatingFilter | null)[] = [null, ...ReviewRatingFilterEnum.options.filter((key) => countOf(key) > 0)];
  // Çubuk oranı en çok oylanana göre: tasarımda en yüksek çubuk tam dolar.
  const max = Math.max(...breakdown, 0);

  // Liste sınırsız büyür; sonu görününce sonraki sayfa istenir.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (el === null || cursor === null) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) loadMore();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [cursor, loadMore]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-sand-50">
      <FunnelHeader backLabel={product.back} fallback="/catalog" eyebrow={productName} title={copy.title} />

      <div className="flex flex-col gap-3 px-4 pt-3 pb-8">
        {score.average !== null && (
          <div className="flex items-center gap-4">
            <span className="font-serif text-h1-md leading-none text-ink">{formatDecimal(score.average, locale, 1)}</span>
            <div className="flex flex-col gap-1">
              <PhoneStars value={score.average} />
              <span className="font-sans text-note text-muted">{ratingCountLabel(score.totalCount, copy)}</span>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = breakdown[star - 1] ?? 0;
            return (
              <div key={star} className="flex items-center gap-2.5">
                <span className="flex w-6 flex-none items-center gap-0.5 font-sans text-micro text-body">
                  {star}
                  <Icon name="star" size={10} className="text-star" />
                </span>
                <span className="block h-2 flex-1 overflow-hidden rounded-pill bg-sand-200">
                  <span className="block h-2 rounded-pill bg-star" style={{ width: max > 0 ? `${(count / max) * 100}%` : '0%' }} />
                </span>
                <span className="w-6 flex-none text-right font-sans text-micro text-muted">{count}</span>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2 py-1">
          {chips.map((key) => (
            <Chip
              key={key ?? 'all'}
              // Native çiple aynı etiket: kit çipi yalnız metin çizer, yıldız karakterle durur.
              label={copy.filters[key ?? 'all'].replace('{count}', String(countOf(key))).replace('{star}', '★')}
              selected={filter === key}
              onClick={() => setFilter(key)}
            />
          ))}
        </div>

        {reviews.map((review) => (
          <PhoneReviewCard key={review.id} review={review} locale={locale} />
        ))}

        {/* Boş durum yalnız ilk sayfa geldikten sonra: yükleme sırasında "yorum yok" demek bir saniye sonra kendini yalanlardı. */}
        {loaded && !failed && reviews.length === 0 && <p className="py-6 text-center font-sans text-body-sm text-muted">{copy.panelEmpty}</p>}

        {failed && (
          <button
            type="button"
            onClick={retry}
            className="cursor-pointer rounded-soft border border-sand-300 py-2.5 text-center font-sans text-body-sm font-bold text-olive transition-colors hover:bg-cream"
          >
            {copy.retry}
          </button>
        )}

        {loading && loaded && <p className="py-2 text-center font-sans text-note text-muted">{copy.loading}</p>}
        <div ref={sentinel} aria-hidden className="h-px" />
      </div>
    </div>
  );
}
