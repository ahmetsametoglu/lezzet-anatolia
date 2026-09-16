'use client';

import { useEffect, useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { formatDecimal } from '@/lib/storefront/format';
import { Icon } from '@/components/customer/ui/icons';
import type { Messages, ReviewsData } from '../product-types';
import { ReviewForm } from './review-form';
import { AllReviews } from './all-reviews';
import { ReviewCard, Stars } from './review-card';

/**
 * Yorumlar bölümü — puan kartı, ilk yorumlar ve "yorum yaz".
 *
 * **Sayfa yalnız ONAYLI yorumu gösterir** ve bu kural burada değil kapıda yaşıyor: yayın okuması
 * durum parametresi almıyor (`listProductReviews`), "kim yazabilir" sorusunu da kapı cevaplıyor
 * (`getReviewEligibility`) — ekranın bu iki kararı esnetebileceği bir yol yok.
 *
 * Tasarımın üç kuralı:
 *   · **Puan alanı GİZLENİR** — "0,0" gösterilmez; sıfır puan kötü ürün değil "henüz kimse
 *     yazmadı" demektir ve ikisi aynı ekranla anlatılamaz.
 *   · **İlk üç yorum** görünür; bağlantı ancak fazlası varken çizilir (tıklayınca aynı listeyi
 *     gösteren bir bağ, bir vaat ihlalidir).
 *   · **"Yorum yaz" yalnız satın almış girişli müşteride** — göstermek, yazamayacak kişiye
 *     kapalı bir kapı açmaktır.
 */
interface ReviewsProps {
  t: Messages;
  locale: Locale;
  productId: string;
  /** Panel başlığındaki alt satır ("Antep Fıstıklı Baklava · N yorum") — tasarımın künyesi. */
  productName: string;
  data: ReviewsData;
  compact?: boolean;
}

export function Reviews({ t, locale, productId, productName, data, compact = false }: ReviewsProps) {
  const [writing, setWriting] = useState(false);
  // Gönderimden sonra liste TAZELENMEZ ve tazelenmemeli: yorum moderasyondan geçmeden yayına
  // girmiyor. "Kaydedildi" demek yeterli; listede aramak müşteriyi kendi yorumunu ararken bırakırdı.
  const [submitted, setSubmitted] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const { score, reviews, total, canReview, alreadyWrote } = data;

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
          <Icon name="star" size={24} className="text-sand-400" />
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
        <ReviewCard key={review.id} review={review} locale={locale} verifiedLabel={t.reviews.verified} translation={t.reviews.translation} />
      ))}

      {/* Bağlantı ancak gösterilenden FAZLA yorum varken çizilir: aynı listeyi açan bir bağ,
          olmayan bir kapı gösterirdi. */}
      {total > reviews.length && (
        <button
          type="button"
          onClick={openPanel}
          className="cursor-pointer text-left font-sans text-body-sm font-bold text-olive transition-colors hover:text-olive-dark"
        >
          {t.reviews.all.replace('{count}', String(total))}
        </button>
      )}

      {!canReview && <span className="font-sans text-micro leading-relaxed text-muted">{t.reviews.onlyBuyers}</span>}

      {panelOpen && (
        <AllReviews
          t={t}
          locale={locale}
          productId={productId}
          productName={productName}
          breakdown={score.ratingBreakdown}
          total={total}
          fullScreen={compact}
          onClose={closePanel}
        />
      )}
    </section>
  );
}

// `Stars` ve `initialOf` buradan `review-card.tsx`'e taşındı: panel de aynı kartı ve aynı yıldız
// satırını çiziyor, iki kopya aynı yorumu iki ekranda farklı gösterirdi (`CLAUDE.md §1`).
