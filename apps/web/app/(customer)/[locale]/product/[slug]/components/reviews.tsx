'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { formatDecimal, formatShortDate } from '@/lib/storefront/format';
import type { Messages, ReviewsData } from '../product-types';
import { ReviewForm } from './review-form';

/**
 * Yorumlar bölümü (17.1 müşteri yüzü) — puan kartı, ilk yorumlar ve "yorum yaz".
 *
 * **Sayfa yalnız ONAYLI yorumu gösterir** ve bu kural burada değil kapıda yaşıyor: yayın okuması
 * durum parametresi almıyor (`listProductReviews`), yani ekranın "onaysızı da göster" diyebileceği
 * bir yol yok. Aynı şekilde "kim yazabilir" sorusunu da ekran cevaplamıyor — kapı siparişleri
 * okuyup karar veriyor (`getReviewEligibility`).
 *
 * Tasarımın üç kuralı:
 *   · **Puan alanı GİZLENİR** — "0,0" gösterilmez; sıfır puan kötü ürün demek değildir, "henüz
 *     kimse yazmadı" demektir ve ikisi aynı ekranla anlatılamaz.
 *   · **İlk üç yorum** görünür; üçten fazlası varsa "tümü" bağlantısı çıkar, üç ve altındaysa
 *     bağlantı HİÇ görünmez (tıklayınca aynı listeyi gösteren bir bağ, bir vaat ihlalidir).
 *   · **"Yorum yaz" yalnız satın almış girişli müşteride** — göstermek, yazamayacak kişiye
 *     kapalı bir kapı açmaktır.
 *
 * Bölüm ayrıca sayfanın dengesini kurar: masaüstünde beyan sütununun yanında durur.
 */
interface ReviewsProps {
  t: Messages;
  locale: Locale;
  productId: string;
  data: ReviewsData;
  compact?: boolean;
}

export function Reviews({ t, locale, productId, data, compact = false }: ReviewsProps) {
  const [writing, setWriting] = useState(false);
  // Gönderimden sonra liste TAZELENMEZ ve tazelenmemeli: yorum moderasyondan geçmeden yayına
  // girmiyor. "Kaydedildi" demek yeterli; listede aramak müşteriyi kendi yorumunu ararken bırakırdı.
  const [submitted, setSubmitted] = useState(false);

  const { score, reviews, total, canReview, alreadyWrote } = data;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={['font-serif text-ink', compact ? 'text-card-title-sm' : 'text-card-title'].join(' ')}>{t.reviews.title}</h2>
        {canReview && !alreadyWrote && !submitted && (
          <button
            type="button"
            onClick={() => setWriting((v) => !v)}
            className="cursor-pointer font-sans text-body-sm font-bold text-olive transition-colors hover:text-olive-dark"
          >
            {t.reviews.write}
          </button>
        )}
      </div>

      {submitted && (
        // Moderasyon gerçeği SÖYLENİR: "yayınlandı" demek yalan olurdu, sessiz kalmak da müşteriye
        // yorumunun kaybolduğunu düşündürürdü.
        <p className="rounded-soft bg-olive-bg px-4 py-3 font-sans text-note leading-relaxed font-semibold text-olive">{t.reviews.submitted}</p>
      )}

      {writing && !submitted && (
        <ReviewForm
          t={t}
          productId={productId}
          onDone={() => {
            setWriting(false);
            setSubmitted(true);
          }}
          onCancel={() => setWriting(false)}
        />
      )}

      {score.average === null ? (
        <div className="flex flex-col items-center gap-1.5 rounded-soft border border-dashed border-sand-400 px-6 py-6 text-center">
          <span className="text-icon">☆</span>
          <span className="font-sans text-body font-bold text-ink">{t.reviews.emptyTitle}</span>
          <span className="font-sans text-note text-muted">{t.reviews.emptyBody}</span>
        </div>
      ) : (
        <div className="flex items-center gap-4.5 rounded-card border border-sand-200 bg-card px-5.5 py-4.5">
          {/* Ortalama TEK ve iri: tasarımın bu kartta söylediği tek şey "bu ürün kaç alıyor". */}
          <span className={['font-serif leading-tight text-ink', compact ? 'text-h1-sm' : 'text-h1-sm'].join(' ')}>
            {formatDecimal(score.average, locale, 1)}
          </span>
          <div className="flex flex-col gap-0.5">
            <Stars value={score.stars ?? score.average} />
            <span className="font-sans text-note text-muted">{t.reviews.count.replace('{count}', String(total))}</span>
          </div>
        </div>
      )}

      {reviews.map((review) => (
        <article key={review.id} className="flex flex-col gap-2 rounded-card border border-sand-200 bg-card px-5.5 py-4.5">
          <div className="flex items-center gap-2.5">
            {/* Baş harf, avatar yerine: profil fotoğrafı diye bir alanımız yok ve olmayan bir
                görselin yer tutucusu her yorumu aynı gri daireyle başlatırdı. */}
            <span className="grid size-9.5 flex-none place-items-center rounded-full bg-olive-bg font-sans text-body-sm font-bold text-olive">
              {initialOf(review.authorName)}
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-sans text-body-sm font-bold text-ink">{review.authorName}</span>
              <span className="font-sans text-micro text-muted">
                {formatShortDate(review.createdAt, locale)} · {t.reviews.verified}
              </span>
            </div>
            {review.rating !== null && (
              <span className="ml-auto flex-none">
                <Stars value={review.rating} small />
              </span>
            )}
          </div>
          {review.comment && <p className="font-sans text-body-sm leading-relaxed text-body">{review.comment}</p>}
        </article>
      ))}

      {/* BEKLEYEN(BACKLOG §1): "tüm yorumlar" paneli (web modal · mobil tam ekran, `?yorumlar=1`).
          Bağlantı ancak üçten fazla yorum varken çizilir — tasarımın kuralı. Bugün panel yok, o
          yüzden bağ da yok: tıklayınca hiçbir yere gitmeyen bir bağ, olmayan bir kapı gösterirdi. */}
      {total > reviews.length && <span className="font-sans text-body-sm font-bold text-muted">{t.reviews.all.replace('{count}', String(total))}</span>}

      {!canReview && <span className="font-sans text-micro leading-relaxed text-muted">{t.reviews.onlyBuyers}</span>}
    </section>
  );
}

/** Yıldız satırı — dolu/boş, yarım yıldız yuvarlanmış hâliyle (skor onu zaten yuvarlıyor). */
function Stars({ value, small = false }: { value: number; small?: boolean }) {
  const full = Math.round(value);
  return (
    <span
      aria-label={`${value} / 5`}
      className={['tracking-[2px] text-honey', small ? 'text-note' : 'text-body'].join(' ')}
    >
      {'★'.repeat(full)}
      <span className="text-sand-400">{'★'.repeat(5 - full)}</span>
    </span>
  );
}

/** Adın baş harfi; ad çözülemediyse (silinmiş profil) nötr bir işaret. */
function initialOf(name: string): string {
  const first = name.trim()[0];
  return first && first !== '—' ? first.toLocaleUpperCase('tr') : '·';
}
