'use client';

import { useEffect, useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import productMessages from '@lezzet/i18n/customer/product';
import { REVIEW_PREVIEW_SIZE } from '@lezzet/types';
import type { ReviewsData } from '../product-types';
import { PhoneAllReviews } from './phone-all-reviews';
import { PhoneReviewCard } from './phone-review-card';

interface PhoneReviewsProps {
  locale: Locale;
  productId: string;
  /** Tüm yorumlar sayfasının üst satırı; hangi ürünün yorumlarına bakıldığını orası söyler. */
  productName: string;
  data: ReviewsData;
}

/**
 * Değerlendirmeler bölümü (tasarım 17a): en yeni yorumlar ve tümünün bağlantısı; puan özeti ürün başlığının üst satırındadır. Yorum
 * telefonda sayfadan yazılmaz, alım sonrası değerlendirme akışından gelir.
 */
export function PhoneReviews({ locale, productId, productName, data }: PhoneReviewsProps) {
  const copy = productMessages[locale].reviews;
  const [panelOpen, setPanelOpen] = useState(false);
  const { score, reviews, total } = data;
  // Sayfa masaüstü için altı yorum okur; telefon seçkisi üç kart.
  const shown = reviews.slice(0, REVIEW_PREVIEW_SIZE);

  // Panel geri tuşuyla kapanır, bu yüzden açılış bir `history` kaydı bırakır; `router.push` sayfayı yeniden çizip seçili boyu kaybettirirdi.
  const openPanel = () => {
    window.history.pushState({ reviews: 1 }, '', `${window.location.pathname}?reviews=1`);
    setPanelOpen(true);
  };

  useEffect(() => {
    if (!panelOpen) return;
    const onPop = () => setPanelOpen(false);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [panelOpen]);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-serif text-card-title-sm text-ink">{copy.title}</h2>

      {shown.length === 0 ? (
        <p className="rounded-card bg-sand-150 px-3 py-2.5 font-sans text-note leading-[1.6] text-muted">{copy.empty}</p>
      ) : (
        shown.map((review) => <PhoneReviewCard key={review.id} review={review} locale={locale} />)
      )}

      {/* Bağlantı yalnız gösterilenden fazla yorum varken: aynı listeyi açan bağlantı olmayan bir kapı gösterirdi. */}
      {total > shown.length && (
        <button
          type="button"
          onClick={openPanel}
          className="cursor-pointer self-start font-sans text-body-sm font-bold text-olive transition-colors hover:text-olive-dark"
        >
          {copy.all.replace('{count}', String(total))}
        </button>
      )}

      {panelOpen && <PhoneAllReviews locale={locale} productId={productId} productName={productName} score={score} total={total} />}
    </section>
  );
}
