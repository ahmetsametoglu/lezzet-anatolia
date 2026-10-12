'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import productMessages from '@lezzet/i18n/customer/product';
import type { PublishedReview } from '@lezzet/types';
import { Icon } from '@/components/customer/ui/icons';

/**
 * Telefon yorum kartı: kum zemin, çerçevesiz, iki satır (ad ve puan, altında metin); tarih yazılmaz (tasarım 18a). Masaüstünün
 * kartından ayrı dosya, çünkü iki tasarım ayrıldı ve birini değiştirmek ötekini kımıldatmamalı.
 */
interface PhoneReviewCardProps {
  review: PublishedReview;
  locale: Locale;
}

export function PhoneReviewCard({ review, locale }: PhoneReviewCardProps) {
  const copy = productMessages[locale].reviews;
  // Varsayılan çeviridir, çünkü okunabilirlik asıl amaç; makine çevirisi yorumu yumuşatabileceği için orijinal bir dokunuş uzakta.
  const [showingOriginal, setShowingOriginal] = useState(false);
  const translated = review.commentTranslated && review.originalComment !== null;
  const shown = translated && showingOriginal ? review.originalComment : review.comment;

  return (
    <article className="flex flex-col gap-2 rounded-card bg-sand-250 px-3.5 py-3">
      <div className="flex items-center gap-2.5">
        <span className="min-w-0 truncate font-sans text-body-sm font-bold text-ink">{review.authorName}</span>
        {review.rating !== null ? (
          <span className="ml-auto flex-none">
            <PhoneStars value={review.rating} small />
          </span>
        ) : (
          // Yıldızsız yorum değerlendirme akışından gelir ve oyu taşır; beğeni yıldız gibi çizilseydi uydurma bir puan okunurdu.
          review.vote === 'like' && (
            <span className="ml-auto inline-flex flex-none items-center gap-1 font-sans text-note font-bold text-olive">
              <Icon name="heart" size={13} />
              {copy.liked}
            </span>
          )
        )}
      </div>
      {shown && (
        // `lang` gösterilen metnin gerçek dilidir; ekran okuyucusu ve tarayıcı çevirisi buna bakar.
        <p lang={showingOriginal ? (review.language ?? undefined) : locale} className="font-sans text-body-sm leading-relaxed text-body">
          {shown}
        </p>
      )}

      {translated && (
        <button
          type="button"
          onClick={() => setShowingOriginal((v) => !v)}
          className="cursor-pointer self-start font-sans text-micro font-bold text-olive transition-colors hover:text-olive-dark"
        >
          {showingOriginal ? copy.translation.showTranslation : copy.translation.showOriginal}
        </button>
      )}
    </article>
  );
}

/** Yıldız satırı; değer tam yıldıza yuvarlanır, çünkü telefon kartı yarım yıldız çizmez. */
export function PhoneStars({ value, small = false }: { value: number; small?: boolean }) {
  const full = Math.round(value);
  return (
    <span aria-label={`${value} / 5`} className="inline-flex items-center gap-0.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <Icon key={i} name="star" size={small ? 15 : 18} className={i < full ? 'text-star' : 'text-sand-400'} />
      ))}
    </span>
  );
}
