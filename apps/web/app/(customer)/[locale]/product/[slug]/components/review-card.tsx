'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { TranslationNote } from '@/components/customer/ui/translation-note';
import { Icon } from '@/components/customer/ui/icons';
import type { PublishedReview } from '@/lib/feedback/product-feedback';
import { formatShortDate } from '@/lib/storefront/format';

/**
 * Tek yorum kartı — ürün detayındaki seçki ve "tüm yorumlar" paneli AYNI kartı çizer; ayrı
 * yazılsalardı müşteri panelden sayfaya dönünce okuduğu satırın aynı satır olduğunu tanıyamazdı.
 *
 * `Stars` da burada yaşıyor: yıldız gösterimi bu ailenin ortak parçası (`CLAUDE.md §1`).
 */
interface ReviewCardProps {
  review: PublishedReview;
  locale: Locale;
  /** "Satın aldı" rozetinin metni — komponent metin taşımaz, çağıranın sözlüğünden gelir. */
  purchasedLabel: string;
  /** Çeviri şeridinin metinleri: rozet + iki yönlü bağlantı. */
  translation: { badge: string; showOriginal: string; showTranslation: string };
  /**
   * Panelin kart zemini (tasarım): panelde kartlar `cream` zeminde beyaz/krem kutular, sayfada
   * ise sayfanın kendi zemininde çerçeveli. Fark tasarımın kararı, sınıf uydurulmadı.
   */
  boxed?: boolean;
}

export function ReviewCard({ review, locale, purchasedLabel, translation, boxed = false }: ReviewCardProps) {
  /**
   * Müşteri orijinali görmek istedi mi — varsayılan ÇEVİRİ, çünkü okunabilirlik asıl amaç.
   *
   * Orijinal yine de bir tık uzakta: makine çevirisi bir yorumu yumuşatabilir ya da
   * sertleştirebilir, müşteri gerektiğinde yazarın kendi cümlesine ulaşabilmeli.
   */
  const [showingOriginal, setShowingOriginal] = useState(false);
  // Rozet ve bağlantı YALNIZ gerçekten çevrilmiş metinde: aynı dilde yazılmış bir yoruma "otomatik
  // çevrildi" demek, olmayan bir işlemi bildirmek olurdu.
  const translated = review.commentTranslated && review.originalComment !== null;
  const shown = translated && showingOriginal ? review.originalComment : review.comment;

  return (
    <article
      className={[
        'flex flex-col gap-1.75 rounded-control border px-4.75 py-4',
        boxed ? 'border-sand-200 bg-cream-deep' : 'border-sand-200 bg-card',
      ].join(' ')}
    >
      {/* Satır YILDIZLA başlar (tasarım 20.09): baş harf dairesi kalktı, çünkü kartların asıl bilgisi
          kimin yazdığı değil kaç verdiği — üç sütunlu akışta göz önce puanı tarıyor. */}
      <div className="flex flex-wrap items-center gap-2.25">
        {review.rating !== null && <Stars value={review.rating} small />}
        <span className="font-sans text-control text-ink">{review.authorName}</span>
        <span className="font-sans text-field-label font-normal text-muted">· {formatShortDate(review.createdAt, locale)}</span>
        {/* "Satın aldı" bir ROZET: ibare tarihin yanında soluk bir ek cümleyken okunmuyordu. */}
        <span className="rounded-badge bg-olive-bg px-2 py-0.5 font-sans text-micro font-semibold text-olive">{purchasedLabel}</span>
      </div>
      {shown && (
        // `lang` GERÇEK dili söyler: orijinal gösteriliyorsa metnin kendi dili, çeviri
        // gösteriliyorsa okuyucunun dili. Ekran okuyucuları ve tarayıcı çevirisi buna bakar —
        // yanlış `lang`, Boşnakça bir cümleyi Fransızca telaffuzla okutur.
        <p lang={showingOriginal ? (review.language ?? undefined) : locale} className="font-sans text-control font-normal leading-relaxed text-body">
          {shown}
        </p>
      )}

      {/* Rozet + bağlantı ORTAK şeritten (`TranslationNote`): aynı bilgiyi talep yazışması ve B2B
          ret gerekçesi de gösteriyor, üç kopya üç ekranda üç türlü görünürdü. */}
      {translated && (
        <TranslationNote
          badge={translation.badge}
          toggle={{
            showingOriginal,
            onToggle: () => setShowingOriginal((v) => !v),
            showOriginal: translation.showOriginal,
            showTranslation: translation.showTranslation,
          }}
        />
      )}
    </article>
  );
}

/**
 * Yıldız satırı — dolu, yarım ya da boş. Skor yarım adıma yuvarlanmış gelir (4,33 → 4,5); yarım yıldız, boş yıldızın üstüne
 * yarısına kadar kırpılmış dolu yıldızla çizilir. Tam sayıya yuvarlamak 4,5'i beş dolu yıldız gösteriyordu.
 */
export function Stars({ value, small = false }: { value: number; small?: boolean }) {
  const size = small ? 13 : 16;
  return (
    <span aria-label={`${value} / 5`} className="inline-flex items-center gap-0.5">
      {[0, 1, 2, 3, 4].map((i) => {
        const rest = value - i;
        const fill = rest >= 0.75 ? 100 : rest >= 0.25 ? 50 : 0;
        return (
          <span key={i} className="relative inline-flex">
            <Icon name="star" size={size} className="text-sand-400" />
            {fill > 0 && (
              <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill}%` }}>
                <Icon name="star" size={size} className="text-star" />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
