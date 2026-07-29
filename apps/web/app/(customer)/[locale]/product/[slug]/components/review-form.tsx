'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { Button } from '@/components/customer/ui/button';
import { submitReviewAction } from '../actions';
import type { Messages } from '../product-types';

/**
 * Yorum yazma formu — puan (1-5) + metin (tasarım: "Yorum yaz").
 *
 * **İkisi de tek başına yeterli:** yalnız yıldız veren de, yalnız yazan da yorumunu bırakabilir;
 * kapı yalnız ikisinin BİRDEN boş olmasını reddediyor (`empty_review`). Zorunlu metin, yıldız
 * vermek isteyen müşteriyi cümle kurmaya zorlardı.
 *
 * **Ekran "yayınlandı" demez.** Yorum moderasyondan geçmeden görünmüyor (17.1); "yayınlandı"
 * demek yalan, hiçbir şey dememek ise müşteriye yorumunun kaybolduğunu düşündürürdü.
 */
interface ReviewFormProps {
  t: Messages;
  productId: string;
  onDone: () => void;
  onCancel: () => void;
}

export function ReviewForm({ t, productId, onDone, onCancel }: ReviewFormProps) {
  const locale = useLocale();
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const { data, error: failure } = await submitReviewAction({ locale, productId, rating, comment });
    setBusy(false);
    if (data) return onDone();
    // Kapının sebebi sözlüğe çevrilir; tanımadığımız bir sebep gelirse genel cümle kalır — motora
    // yeni bir ret eklendiğinde ekran boş kalmasın diye.
    setError(failure && failure in t.reviews.formError ? t.reviews.formError[failure as keyof Messages['reviews']['formError']] : t.reviews.formError.failed);
  };

  return (
    <div className="flex flex-col gap-3 rounded-card border border-sand-200 bg-card px-5.5 py-4.5">
      <div className="flex items-center gap-2">
        <span className="font-sans text-body-sm font-bold text-ink">{t.reviews.rating}</span>
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(rating === n ? null : n)}
              aria-label={`${n} / 5`}
              aria-pressed={rating !== null && n <= rating}
              className={[
                'cursor-pointer text-icon-sm leading-none transition-colors',
                rating !== null && n <= rating ? 'text-honey' : 'text-sand-400 hover:text-honey',
              ].join(' ')}
            >
              ★
            </button>
          ))}
        </div>
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={t.reviews.placeholder}
        aria-label={t.reviews.title}
        rows={3}
        className="w-full resize-none rounded-soft border border-sand-300 bg-card px-3.5 py-2.5 font-sans text-body-sm leading-relaxed text-ink outline-none placeholder:text-muted focus-visible:border-olive"
      />

      {error && <span className="font-sans text-note leading-relaxed font-semibold text-terracotta">{error}</span>}

      <div className="flex items-center gap-2">
        <Button size="sm" disabled={busy || (rating === null && !comment.trim())} onClick={() => void submit()}>
          {busy ? t.reviews.sending : t.reviews.send}
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          {t.reviews.cancel}
        </Button>
      </div>

      <span className="font-sans text-micro leading-relaxed text-muted">{t.reviews.moderationNote}</span>
    </div>
  );
}
