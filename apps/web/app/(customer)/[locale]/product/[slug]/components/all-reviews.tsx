'use client';

import { useCallback, useEffect, useState } from 'react';
import type { KeysetCursor } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import type { PublishedReview } from '@/lib/feedback/product-feedback';
import { Dialog } from '@/components/customer/ui/dialog';
import type { Messages } from '../product-types';
import { loadMoreReviewsAction } from '../actions';
import { ReviewCard } from './review-card';

/**
 * **Tüm yorumlar paneli** (08.11 · tasarım `Musteri - Urun Detay.dc.html` → `Tum Yorumlar
 * Web/Mobil`) — ürün detayındaki üç yorumluk seçkinin arkasındaki tam liste.
 *
 * ── PANEL SAYFAYI TERK ETMEZ ─────────────────────────────────────────────────
 * Tasarımın kuralı: *"web'de modal, mobilde tam ekran sayfa; geri tuşu paneli kapatır, sayfa
 * konumu korunur."* Bu yüzden ayrı bir ROTA değil — ayrı rota olsaydı geri dönüşte ürün sayfası
 * baştan çizilir, müşteri galeriyi ve seçtiği boyu kaybederdi.
 *
 * Açık/kapalı hâli `history` üzerinden yürüyor (`?reviews=1`): panel açılırken bir kayıt eklenir,
 * geri tuşu onu düşürür ve `popstate` paneli kapatır. Next'in yönlendiricisi KULLANILMIYOR ve
 * sebebi bu — `router.push` sunucu bileşenini yeniden çalıştırır, yani "sayfa konumu korunur"
 * sözü tutulamazdı. Adres çubuğundaki anahtar İNGİLİZCE (`reviews`), tasarımın `?yorumlar=1`
 * yazması Türkçe ekranın gösterimi; sorgu anahtarları bu projede dile göre çevrilmiyor
 * (`?offers=1` ile aynı kural).
 *
 * ── LİSTE PANELDE ÇEKİLİR, SAYFADA DEĞİL ────────────────────────────────────
 * İlk on yorum panel AÇILINCA isteniyor. Ürün sayfasına gömmek, panelin hiç açılmadığı her
 * ziyarette on satırı boşuna okumak olurdu — sayfanın en çok ziyaret edilen kısmı bu değil.
 *
 * ── HİSTOGRAM VE ÇİPLER: SAYILAR DAĞILIMDAN, SATIRLAR SORGUDAN ──────────────
 * Çubuklar ve çip sayıları `score.ratingBreakdown`'dan okunuyor — yani ürünün TAMAMINDAN, o an
 * yüklenmiş sayfadan değil. Sayfalanmış listeden sayılan bir dağılım yanlış olurdu ve yanlışlığı
 * GÖRÜNMEZDİ: çubuklar hep bir şey gösterir.
 *
 * Süzgeç sunucuda uygulanıyor (`rating` aralığı). Arka ucun uyarısı burada karşılandı: süzgeç
 * verildiğinde yıldızsız (yalnız metinli) yorumlar düşer, o yüzden çip sayıları `ratingBreakdown`
 * ile okunuyor — "Tümü" sayısıyla çip toplamlarının farkı bir hata değil, iki farklı kümedir.
 */
/**
 * Süzgeç çipleri — tasarımın dört seçeneği. `range` doğrudan sorguya gider; `null` = tümü.
 *
 * "3★ ve altı" tek bir yıldız değil ARALIK: düşük puanları tek çipte toplamak tasarımın kararı ve
 * doğru olanı — 2★ ile 1★ arasındaki ayrım müşteriye bir şey söylemez, "kötü yorumları göster"
 * söyler.
 */
const FILTERS = [
  { key: 'all', range: null },
  { key: 'five', range: { min: 5, max: 5 } },
  { key: 'four', range: { min: 4, max: 4 } },
  { key: 'low', range: { max: 3 } },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

interface AllReviewsProps {
  t: Messages;
  locale: Locale;
  productId: string;
  productName: string;
  /** Ürünün TAMAMININ dağılımı — çubuklar ve çip sayıları buradan, yüklenmiş sayfadan değil. */
  breakdown: readonly [number, number, number, number, number];
  /** Yazılı yorum sayısı (`commentCount`) — "Tümü" çipinin ve alt satırın sayısı. */
  total: number;
  /** Mobil tam ekran, masaüstü modal — cihaz sinyali `Reviews`'tan geçer. */
  fullScreen: boolean;
  onClose: () => void;
}

export function AllReviews({ t, locale, productId, productName, breakdown, total, fullScreen, onClose }: AllReviewsProps) {
  const [reviews, setReviews] = useState<PublishedReview[]>([]);
  const [cursor, setCursor] = useState<KeysetCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  /** İlk sayfa geldi mi — "hiç yorum yok" boş durumu ancak ondan sonra söylenebilir. */
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');

  /** Bir çipin sayısı — dağılım dizisi 0-indisli ve indis 0 = 1★ (arka ucun sözleşmesi). */
  const countOf = (key: FilterKey): number => {
    if (key === 'five') return breakdown[4];
    if (key === 'four') return breakdown[3];
    if (key === 'low') return breakdown[0] + breakdown[1] + breakdown[2];
    return total;
  };

  const load = useCallback(
    async (from: KeysetCursor | null, key: FilterKey) => {
      setLoading(true);
      setFailed(false);
      const range = FILTERS.find((f) => f.key === key)?.range ?? null;
      const result = await loadMoreReviewsAction({
        locale,
        productId,
        ...(from ? { cursor: from } : {}),
        ...(range ? { rating: range } : {}),
      });
      if (result.data) {
        // İmleçsiz çağrı listeyi SIFIRLAR, imleçli EKLER. Çip değişimi imleçsizdir: yeni süzgeç
        // yeni bir küme demektir, eskinin satırları altında kalsaydı liste iki soruyu karıştırırdı.
        setReviews((prev) => (from ? [...prev, ...result.data!.reviews] : result.data!.reviews));
        setCursor(result.data.nextCursor);
      } else {
        // Sessiz düşmüyoruz: liste yarım kalırsa müşteri "yorumlar bitti" sanar. Tekrar denenebilir
        // bir hâl gösteriliyor, çünkü düşen şey bir okuma — kaybolan bir veri yok.
        setFailed(true);
      }
      setLoading(false);
      setLoaded(true);
    },
    [locale, productId],
  );

  useEffect(() => {
    void load(null, filter);
  }, [load, filter]);

  const body = (
    <div className="flex flex-col gap-3">
      {/* Yıldız dağılımı — çubuklar ürünün TAMAMINDAN. Sıra 5★'dan 1★'a, tasarımın sırası. */}
      <div className="flex flex-col gap-1.5">
        {[5, 4, 3, 2, 1].map((star) => {
          const count = breakdown[star - 1] ?? 0;
          // Oran EN ÇOK OYLANANA göre, toplama göre değil: tasarımda 5★ çubuğu %78 ve o, 18/23'ün
          // değil en yüksek çubuğun tam dolduğu bir ölçek. Hiç oy yoksa bölme yapılmaz.
          const max = Math.max(...breakdown, 0);
          return (
            <div key={star} className="flex items-center gap-2.5">
              <span className="w-6 flex-none font-sans text-micro text-body">{star}★</span>
              <span className="block h-2 flex-1 overflow-hidden rounded-pill bg-sand-100">
                <span className="block h-2 rounded-pill bg-honey" style={{ width: max > 0 ? `${(count / max) * 100}%` : '0%' }} />
              </span>
              <span className="w-6 flex-none text-right font-sans text-micro text-muted">{count}</span>
            </div>
          );
        })}
      </div>

      {/* Süzgeç çipleri — sayısı SIFIR olan çip çizilmez: basılınca boş liste gösteren bir çip,
          müşteriye kendi dokunuşunu sorgulatır. "Tümü" her zaman durur. */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.filter((f) => f.key === 'all' || countOf(f.key) > 0).map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={[
              'cursor-pointer rounded-pill border px-3.5 py-1.5 font-sans text-note font-semibold transition-colors',
              filter === f.key ? 'border-olive bg-olive text-cream' : 'border-sand-300 bg-card text-ink hover:border-olive',
            ].join(' ')}
          >
            {t.reviews.filters[f.key].replace('{count}', String(countOf(f.key)))}
          </button>
        ))}
      </div>

      {reviews.map((review) => (
        <ReviewCard key={review.id} review={review} locale={locale} verifiedLabel={t.reviews.verified} boxed />
      ))}

      {/* Boş durum yalnız İLK SAYFA geldikten sonra: yükleme sırasında "yorum yok" demek, bir saniye
          sonra kendini yalanlayan bir cümle olurdu. */}
      {loaded && !failed && reviews.length === 0 && (
        <p className="py-6 text-center font-sans text-body-sm text-muted">{t.reviews.panelEmpty}</p>
      )}

      {failed && (
        <button
          type="button"
          onClick={() => void load(cursor, filter)}
          className="cursor-pointer rounded-soft border border-sand-300 py-2.5 text-center font-sans text-body-sm font-bold text-olive transition-colors hover:bg-cream"
        >
          {t.reviews.retry}
        </button>
      )}

      {/* "Daha fazla yükle" YALNIZ devam eden sayfa varken. Tükenmiş listede duran bir düğme,
          basılınca hiçbir şey olmayan bir kontroldür. */}
      {cursor && !failed && (
        <button
          type="button"
          disabled={loading}
          onClick={() => void load(cursor, filter)}
          className="cursor-pointer rounded-pill border-[1.5px] border-olive px-4.5 py-2.5 text-center font-sans text-body-sm font-bold text-olive transition-colors hover:bg-olive-bg disabled:opacity-60"
        >
          {loading ? t.reviews.loading : t.reviews.loadMore.replace('{shown}', String(reviews.length))}
        </button>
      )}
    </div>
  );

  /**
   * Masaüstü: paylaşılan `Dialog` kabuğu. Escape, odak tuzağı ve gövde kaydırma kilidi oradan
   * geliyor — ikinci bir kabuk yazmak, K3'te kapatılan kopya sınıfını geri açardı. Genişlik 720
   * tasarımın ölçüsü (`Dialog` varsayılanı 420, listeli panel için dar).
   */
  if (!fullScreen) {
    return (
      <Dialog title={t.reviews.title} closeLabel={t.reviews.close} onClose={onClose} maxWidth={720}>
        <p className="-mt-1 font-sans text-micro text-muted">
          {productName} · {t.reviews.shownCount.replace('{shown}', String(reviews.length))}
        </p>
        {body}
      </Dialog>
    );
  }

  /**
   * Mobil: TAM EKRAN, modal değil. Tasarımın kararı ve gerekçesi dar ekranda görünür — ortalanmış
   * bir panel, altındaki sayfanın kenarlarını göstererek listeyi bir kutunun içine hapsederdi.
   * Kendi başlığı var (← geri · başlık · sayı) çünkü `Dialog`'un başlığı modal içindir.
   */
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-cream">
      <header className="flex flex-none items-center gap-3 border-b border-sand-300 bg-white px-4 py-3.5">
        <button
          type="button"
          onClick={onClose}
          aria-label={t.reviews.close}
          className="flex size-11 flex-none cursor-pointer items-center justify-center font-sans text-body font-bold text-olive"
        >
          ←
        </button>
        <span className="truncate font-serif text-lead font-semibold text-ink">{t.reviews.title}</span>
      </header>
      {/* `min-h-0`: flex çocuğu içeriğinden küçülmez — o olmadan liste taşar ve başlık kayar. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <p className="mb-3 font-sans text-micro text-muted">
          {productName} · {t.reviews.shownCount.replace('{shown}', String(reviews.length))}
        </p>
        {body}
      </div>
    </div>
  );
}
