'use client';

import { useEffect, useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import productMessages from '@lezzet/i18n/customer/product';
import { formatDecimal } from '@/lib/storefront/format';
import type { Messages, ReviewsData } from '../product-types';
import { ReviewForm } from './review-form';
import { PhoneAllReviews } from './phone-all-reviews';
import { PhoneReviewCard, PhoneStars } from './phone-review-card';

/**
 * Yorum yokken puan alanı çizilmez, çünkü "0,0" kötü ürünle henüz kimsenin yazmadığı ürünü ayırmaz. "Yorum yaz" yalnız satın
 * almış girişli müşteride çizilir; onaylı yorum süzgeci ve yazma izni kapıdadır (`listProductReviews`, `getReviewEligibility`).
 */
interface PhoneReviewsProps {
  t: Messages;
  locale: Locale;
  productId: string;
  /** Panelin başlığındaki üst satır — hangi ürünün yorumlarına bakıldığını orası söyler. */
  productName: string;
  data: ReviewsData;
}

export function PhoneReviews({ t, locale, productId, productName, data }: PhoneReviewsProps) {
  const [writing, setWriting] = useState(false);
  // Gönderimden sonra liste TAZELENMEZ ve tazelenmemeli: yorum moderasyondan geçmeden yayına
  // girmiyor. "Kaydedildi" demek yeterli; listede aramak müşteriyi kendi yorumunu ararken bırakırdı.
  const [submitted, setSubmitted] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const { score, reviews, total, canReview, alreadyWrote } = data;

  /** Sayfa masaüstü için altı yorum okur; dar ekranda üçü gösterilir, çünkü alt alta altı yorum sayfanın kalanını görünmez kılardı. */
  const shown = reviews.slice(0, 3);

  /**
   * Panel GERİ TUŞUYLA kapanır (tasarımın kuralı) — bu yüzden açılış bir `history` kaydı bırakır.
   *
   * `router.push` KULLANILMIYOR çünkü Next'in yönlendiricisi sunucu bileşenini yeniden çalıştırır
   * ve müşteri galeriyi ile seçtiği boyu kaybederdi; `history.pushState` yalnız adresi değiştirir.
   */
  const openPanel = () => {
    window.history.pushState({ reviews: 1 }, '', `${window.location.pathname}?reviews=1`);
    setPanelOpen(true);
  };
  // Kapatma da GERİ ile: `history.back()` bıraktığımız kaydı düşürür ve aşağıdaki `popstate`
  // dinleyicisi paneli kapatır. Doğrudan `setPanelOpen(false)` deseydik adres çubuğunda
  // `?reviews=1` asılı kalır, yenilemede panel kapalıyken açıkmış gibi görünürdü.
  const closePanel = () => window.history.back();

  useEffect(() => {
    if (!panelOpen) return;
    const onPop = () => setPanelOpen(false);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [panelOpen]);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        {/* Başlık ORTAK sözlükten: telefon yüzü ile native uygulama aynı tasarım ve referans kare
            "Değerlendirmeler" diyor; masaüstünün kendi karesi "Yorumlar" — sayfa sözlüğü onundur. */}
        <h2 className="font-serif text-card-title-sm text-ink">{productMessages[locale].reviews.title}</h2>
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
        <p className="rounded-soft bg-olive-bg px-4 py-3 font-sans text-note leading-relaxed font-semibold text-olive">
          {t.reviews.submitted}
        </p>
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

      {shown.map((review) => (
        <PhoneReviewCard key={review.id} review={review} locale={locale} translation={t.reviews.translation} />
      ))}

      {score.average === null ? (
        <p className="rounded-card bg-sand-150 px-3 py-2.5 font-sans text-note leading-[1.6] text-muted">
          {productMessages[locale].reviews.empty}
        </p>
      ) : (
        /* Özet kart LİSTENİN ALTINDA ve BEYAZ: okunacak şey yorumların kendisi, kart onların
           toplamını söylüyor. Kum zemine alınsaydı dördüncü bir yorum gibi okunurdu. */
        <div className="flex flex-col gap-3 rounded-card border border-sand-200 bg-card px-5.5 py-4.5">
          <div className="flex items-center gap-4.5">
            {/* Ortalama TEK ve iri: kartın söylediği tek şey "bu ürün kaç alıyor". */}
            <span className="font-serif text-h1-sm leading-tight text-ink">{formatDecimal(score.average, locale, 1)}</span>
            <div className="flex flex-col gap-0.5">
              <PhoneStars value={score.stars ?? score.average} />
              <span className="font-sans text-note text-muted">{t.reviews.count.replace('{count}', String(total))}</span>
            </div>
          </div>
          {/* Kapı özetin İÇİNDE: "hepsi şu kadar" ile "tamamına bak" aynı cümlenin iki yarısı.
              Bağlantı ancak gösterilenden fazla yorum varken çizilir. */}
          {total > shown.length && (
            <button
              type="button"
              onClick={openPanel}
              className="cursor-pointer border-t border-sand-200 pt-3 text-left font-sans text-body-sm font-bold text-olive transition-colors hover:text-olive-dark"
            >
              {t.reviews.all.replace('{count}', String(total))}
            </button>
          )}
        </div>
      )}

      {/* Boş hâlde çizilmez, çünkü kutunun cümlesi kimin yazabileceğini zaten söylüyor. */}
      {!canReview && score.average !== null && (
        <span className="font-sans text-micro leading-relaxed text-muted">{t.reviews.onlyBuyers}</span>
      )}

      {panelOpen && (
        <PhoneAllReviews
          t={t}
          locale={locale}
          productId={productId}
          productName={productName}
          breakdown={score.ratingBreakdown}
          total={total}
          onClose={closePanel}
        />
      )}
    </section>
  );
}
