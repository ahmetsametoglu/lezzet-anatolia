import type { Locale } from '@lezzet/i18n';
import type { PublishedReview } from '@/lib/feedback/product-feedback';
import { formatShortDate } from '@/lib/storefront/format';

/**
 * Tek yorum kartı — ürün detayındaki seçki ve "tüm yorumlar" paneli AYNI kartı çizer.
 *
 * Ayrı yazılsalardı aynı yorum iki yerde farklı görünürdü: müşteri panelden çıkıp sayfaya
 * döndüğünde okuduğu satırın aynı satır olduğunu tanıyamazdı. Kart ayrıca `Stars`'ı da taşıyor —
 * yıldız gösterimi bu ailenin ortak parçası (`CLAUDE.md §1`: hiçbir türde duplication yok).
 *
 * Sunucu bileşeni: kendi durumu yok, yalnız veriyi çiziyor. `'use client'` yazan çağıranların
 * içinde de çalışır.
 */
interface ReviewCardProps {
  review: PublishedReview;
  locale: Locale;
  /** "onaylı alışveriş" ibaresi — komponent metin taşımaz, çağıranın sözlüğünden gelir. */
  verifiedLabel: string;
  /**
   * Panelin kart zemini (tasarım): panelde kartlar `cream` zeminde beyaz/krem kutular, sayfada
   * ise sayfanın kendi zemininde çerçeveli. Fark tasarımın kararı, sınıf uydurulmadı.
   */
  boxed?: boolean;
}

export function ReviewCard({ review, locale, verifiedLabel, boxed = false }: ReviewCardProps) {
  return (
    <article
      className={[
        'flex flex-col gap-2 rounded-card border px-5.5 py-4.5',
        boxed ? 'border-sand-200 bg-cream-deep' : 'border-sand-200 bg-card',
      ].join(' ')}
    >
      <div className="flex items-center gap-2.5">
        {/* Baş harf, avatar yerine: profil fotoğrafı diye bir alanımız yok ve olmayan bir
            görselin yer tutucusu her yorumu aynı gri daireyle başlatırdı. */}
        <span className="grid size-9.5 flex-none place-items-center rounded-full bg-olive-bg font-sans text-body-sm font-bold text-olive">
          {initialOf(review.authorName)}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-sans text-body-sm font-bold text-ink">{review.authorName}</span>
          <span className="font-sans text-micro text-muted">
            {formatShortDate(review.createdAt, locale)} · {verifiedLabel}
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
  );
}

/** Yıldız satırı — dolu/boş, yarım yıldız yuvarlanmış hâliyle (skor onu zaten yuvarlıyor). */
export function Stars({ value, small = false }: { value: number; small?: boolean }) {
  const full = Math.round(value);
  return (
    <span aria-label={`${value} / 5`} className={['tracking-[2px] text-honey', small ? 'text-note' : 'text-body'].join(' ')}>
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
