'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { Icon } from '@/components/customer/ui/icons';
import type { PublishedReview } from '@/lib/feedback/product-feedback';
import { formatRelativeTime } from '@/lib/storefront/format';

/**
 * Telefon yorum kartı — referans `design/01-musteri/Musteri Mobil.dc.html`'in "Değerlendirmeler"
 * bloğu: kum zemin, çerçevesiz, iki satır (künye + metin).
 *
 * Masaüstünün `ReviewCard`ından AYRI bir dosya: müşteri yüzeyinde iki tasarım ayrıldı ve ortak
 * komponent kullanılmıyor; birini değiştirmek ötekini kımıldatmamalı.
 */
interface PhoneReviewCardProps {
  review: PublishedReview;
  locale: Locale;
  /** Çeviri bağlantısının iki metni; rozet telefonda çizilmez. */
  translation: { showOriginal: string; showTranslation: string };
}

export function PhoneReviewCard({ review, locale, translation }: PhoneReviewCardProps) {
  /**
   * Müşteri orijinali görmek istedi mi — varsayılan ÇEVİRİ, çünkü okunabilirlik asıl amaç.
   *
   * Orijinal yine de bir tık uzakta: makine çevirisi bir yorumu yumuşatabilir ya da
   * sertleştirebilir, müşteri gerektiğinde yazarın kendi cümlesine ulaşabilmeli.
   */
  const [showingOriginal, setShowingOriginal] = useState(false);
  // Bağlantı YALNIZ gerçekten çevrilmiş metinde: aynı dilde yazılmış bir yoruma çeviri önermek,
  // olmayan bir işlemi bildirmek olurdu.
  const translated = review.commentTranslated && review.originalComment !== null;
  const shown = translated && showingOriginal ? review.originalComment : review.comment;

  return (
    // Kum zemin, çerçevesiz (tasarım): kart sayfanın kendi yüzeyinden bir ton koyu durur, çerçeve
    // eklemek onu komşusu olmayan bir kutuya çevirirdi.
    <article className="flex flex-col gap-2 rounded-card bg-sand-250 px-3.5 py-3">
      <div className="flex items-baseline gap-2.5">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate font-sans text-body-sm font-bold text-ink">{review.authorName}</span>
          {/* Tarih adın YANINDA, altında değil: referans kart iki satır ve üçüncü bir satır açmak
              yorumun kendisini aşağı iterdi. */}
          <span className="flex-none font-sans text-micro text-muted">· {formatRelativeTime(review.createdAt, locale, Date.now())}</span>
        </span>
        {review.rating !== null && (
          <span className="ml-auto flex-none">
            <PhoneStars value={review.rating} small />
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

      {/* Rozet YOK, yalnız bağlantı: "Orijinali göster" zaten okunanın çeviri olduğunu söylüyor ve
          yanına "otomatik çevrildi" rozeti koymak aynı bilgiyi iki kez yazmaktı. */}
      {translated && (
        <button
          type="button"
          onClick={() => setShowingOriginal((v) => !v)}
          className="cursor-pointer self-start font-sans text-micro font-bold text-olive transition-colors hover:text-olive-dark"
        >
          {showingOriginal ? translation.showTranslation : translation.showOriginal}
        </button>
      )}
    </article>
  );
}

/**
 * Yıldız satırı — dolu/boş, yarım yıldız yuvarlanmış hâliyle (skor onu zaten yuvarlıyor).
 *
 * Ölçüler referanstakinden bir tık iri: tasarım ★ karakterini yazı olarak basıyor ve o glif kendi
 * kare alanını doldurur, bizim ikon yolumuz 24'lük kutuda kenar boşluğu bırakır.
 */
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
