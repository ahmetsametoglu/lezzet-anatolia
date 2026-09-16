'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { TranslationNote } from '@/components/customer/ui/translation-note';
import { Icon } from '@/components/customer/ui/icons';
import type { PublishedReview } from '@/lib/feedback/product-feedback';
import { formatRelativeTime } from '@/lib/storefront/format';

/**
 * Tek yorum kartı — ürün detayındaki seçki ve "tüm yorumlar" paneli AYNI kartı çizer; ayrı
 * yazılsalardı müşteri panelden sayfaya dönünce okuduğu satırın aynı satır olduğunu tanıyamazdı.
 *
 * `Stars` da burada yaşıyor: yıldız gösterimi bu ailenin ortak parçası (`CLAUDE.md §1`).
 */
interface ReviewCardProps {
  review: PublishedReview;
  locale: Locale;
  /** Çeviri şeridinin metinleri: rozet + iki yönlü bağlantı. */
  translation: { badge: string; showOriginal: string; showTranslation: string };
}

export function ReviewCard({ review, locale, translation }: ReviewCardProps) {
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
    // Kum zemin, çerçevesiz (tasarım): kart sayfanın kendi yüzeyinden bir ton koyu durur, çerçeve
    // eklemek onu komşusu olmayan bir kutuya çevirirdi.
    <article className="flex flex-col gap-2 rounded-card bg-sand-250 px-3.5 py-3">
      <div className="flex items-baseline gap-2.5">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate font-sans text-body-sm font-bold text-ink">{review.authorName}</span>
          {/* Tarih adın YANINDA, altında değil: tasarımın kartı iki satır (künye + metin) ve üçüncü
              bir satır açmak yorumun kendisini aşağı iterdi. */}
          <span className="flex-none font-sans text-micro text-muted">· {formatRelativeTime(review.createdAt, locale, Date.now())}</span>
        </span>
        {review.rating !== null && (
          <span className="ml-auto flex-none">
            <Stars value={review.rating} small />
          </span>
        )}
      </div>
      {shown && (
        // `lang` GERÇEK dili söyler: orijinal gösteriliyorsa metnin kendi dili, çeviri
        // gösteriliyorsa okuyucunun dili. Ekran okuyucuları ve tarayıcı çevirisi buna bakar —
        // yanlış `lang`, Boşnakça bir cümleyi Fransızca telaffuzla okutur.
        <p lang={showingOriginal ? (review.language ?? undefined) : locale} className="font-sans text-body-sm leading-relaxed text-body">
          {shown}
        </p>
      )}

      {/* Çeviri şeridi ORTAK (`TranslationNote`): aynı bilgiyi talep yazışması ve B2B ret gerekçesi
          de gösteriyor, üç kopya üç ekranda üç türlü görünürdü. */}
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

/** Yıldız satırı — dolu/boş, yarım yıldız yuvarlanmış hâliyle (skor onu zaten yuvarlıyor). */
export function Stars({ value, small = false }: { value: number; small?: boolean }) {
  const full = Math.round(value);
  return (
    <span aria-label={`${value} / 5`} className="inline-flex items-center gap-0.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <Icon key={i} name="star" size={small ? 13 : 16} className={i < full ? 'text-star' : 'text-sand-400'} />
      ))}
    </span>
  );
}
