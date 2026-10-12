'use client';

import { reviewFilterCount } from '@lezzet/domain-core';
import type { Locale } from '@lezzet/i18n';
import productMessages from '@lezzet/i18n/customer/product';
import { ReviewRatingFilterEnum, type ReviewRatingFilter } from '@lezzet/types';
import { Dialog } from '@/components/customer/ui/dialog';
import { Icon } from '@/components/customer/ui/icons';
import type { Messages } from '../product-types';
import { ReviewCard } from './review-card';
import { StarLabel } from './star-label';
import { useReviewPages } from './use-review-pages.hook';

/**
 * Tüm yorumlar paneli; ayrı bir rota değil, çünkü rotadan dönüşte ürün sayfası baştan çizilir ve müşteri galeriyi ve seçtiği boyu
 * kaybederdi. Çubuklar ve çip sayıları ürünün tamamının dağılımından okunur, yüklenmiş sayfadan değil.
 */
interface AllReviewsProps {
  t: Messages;
  locale: Locale;
  productId: string;
  productName: string;
  /** Ürünün tamamının dağılımı, indis 0 = 1★. */
  breakdown: readonly [number, number, number, number, number];
  /** Yazılı yorum sayısı; "Tümü" çipinin sayısı. */
  total: number;
  /** Mobil tam ekran, masaüstü modal — cihaz sinyali `Reviews`'tan geçer. */
  fullScreen: boolean;
  onClose: () => void;
}

export function AllReviews({ t, locale, productId, productName, breakdown, total, fullScreen, onClose }: AllReviewsProps) {
  const copy = productMessages[locale].reviews;
  const pages = useReviewPages(locale, productId);
  const { reviews, cursor, loading, failed, loaded, filter } = pages;
  const countOf = (key: ReviewRatingFilter | null) => (key === null ? total : reviewFilterCount(breakdown, key));
  // Sayısı sıfır olan çip çizilmez: basılınca boş liste gösteren çip müşteriye kendi dokunuşunu sorgulatır.
  const chips: (ReviewRatingFilter | null)[] = [null, ...ReviewRatingFilterEnum.options.filter((key) => countOf(key) > 0)];

  const body = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        {[5, 4, 3, 2, 1].map((star) => {
          const count = breakdown[star - 1] ?? 0;
          // Oran en çok oylanana göre: tasarımda en yüksek çubuk tam dolar; hiç oy yoksa bölme yapılmaz.
          const max = Math.max(...breakdown, 0);
          return (
            <div key={star} className="flex items-center gap-2.5">
              <span className="flex w-6 flex-none items-center gap-0.5 font-sans text-micro text-body">
                {star}
                <Icon name="star" size={10} className="text-honey" />
              </span>
              <span className="block h-2 flex-1 overflow-hidden rounded-pill bg-sand-100">
                <span className="block h-2 rounded-pill bg-honey" style={{ width: max > 0 ? `${(count / max) * 100}%` : '0%' }} />
              </span>
              <span className="w-6 flex-none text-right font-sans text-micro text-muted">{count}</span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((key) => (
          <button
            key={key ?? 'all'}
            type="button"
            onClick={() => pages.setFilter(key)}
            className={[
              'cursor-pointer rounded-pill border px-3.5 py-1.5 font-sans text-note font-semibold transition-colors',
              filter === key ? 'border-olive bg-olive text-cream' : 'border-sand-300 bg-card text-ink hover:border-olive',
            ].join(' ')}
          >
            <StarLabel label={copy.filters[key ?? 'all'].replace('{count}', String(countOf(key)))} />
          </button>
        ))}
      </div>

      {reviews.map((review) => (
        <ReviewCard key={review.id} review={review} locale={locale} purchasedLabel={t.reviews.purchased} translation={copy.translation} boxed />
      ))}

      {/* Boş durum yalnız ilk sayfa geldikten sonra: yükleme sırasında "yorum yok" demek bir saniye sonra kendini yalanlardı. */}
      {loaded && !failed && reviews.length === 0 && <p className="py-6 text-center font-sans text-body-sm text-muted">{copy.panelEmpty}</p>}

      {failed && (
        <button
          type="button"
          onClick={pages.retry}
          className="cursor-pointer rounded-soft border border-sand-300 py-2.5 text-center font-sans text-body-sm font-bold text-olive transition-colors hover:bg-cream"
        >
          {copy.retry}
        </button>
      )}

      {cursor && !failed && (
        <button
          type="button"
          disabled={loading}
          onClick={pages.loadMore}
          className="cursor-pointer rounded-pill border-[1.5px] border-olive px-4.5 py-2.5 text-center font-sans text-body-sm font-bold text-olive transition-colors hover:bg-olive-bg disabled:opacity-60"
        >
          {loading ? copy.loading : t.reviews.loadMore.replace('{shown}', String(reviews.length))}
        </button>
      )}
    </div>
  );

  // Masaüstünde paylaşılan `Dialog` kabuğu: Escape, odak tuzağı ve kaydırma kilidi oradan gelir; genişlik tasarımın 720'si.
  if (!fullScreen) {
    return (
      <Dialog title={t.reviews.title} closeLabel={t.reviews.close} onClose={onClose} maxWidth={720}>
        <p className="-mt-1 font-sans text-micro text-muted">
          {productName} · {t.reviews.shownCount.replace('{shown}', String(reviews.length))}
        </p>
        {body}
      </Dialog>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-cream">
      <header className="flex flex-none items-center gap-3 border-b border-sand-300 bg-white px-4 py-3.5">
        <button
          type="button"
          onClick={onClose}
          aria-label={t.reviews.close}
          className="flex size-11 flex-none cursor-pointer items-center justify-center font-sans text-copy font-bold text-olive"
        >
          ←
        </button>
        <span className="truncate font-serif text-lead font-semibold text-ink">{t.reviews.title}</span>
      </header>
      {/* `min-h-0`: flex çocuğu içeriğinden küçülmez; o olmadan liste taşar ve başlık kayar. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <p className="mb-3 font-sans text-micro text-muted">
          {productName} · {t.reviews.shownCount.replace('{shown}', String(reviews.length))}
        </p>
        {body}
      </div>
    </div>
  );
}
