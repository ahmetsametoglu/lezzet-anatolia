import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { detectDevice } from '@/lib/device';
import { getProductDetail } from '@/lib/storefront/product';
import { getProductScore, getReviewEligibility, listProductReviews } from '@/lib/feedback/product-feedback';
import { currentCustomerId } from '@/lib/guard';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { routing } from '@/i18n/routing';
import { ProductClient } from './product-client';
import type { Messages } from './product-types';
import messages from './messages.json';

/** Tasarım: ürün detayda ilk ÜÇ yorum; fazlası "tümü" panelinde (design/BACKLOG §1). */
const REVIEW_PAGE_SIZE = 3;

interface ProductPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

/**
 * Ürün detay sayfası (08.11). Veri `lib/storefront/product` kapısından TEK turda okunur.
 *
 * Ürün yoksa ya da satışta değilse 404: aday/pasif ürünün doğrudan linkle açılabilmesi, katalogdan
 * gizlemiş olmayı anlamsız kılardı (DOMAIN §13).
 *
 * Çerçeve metinleri (duyuru şeridi, gezinme, arama) anasayfanın `messages.json`'undan gelir —
 * `SiteFrame` her sayfada aynı metni gösterir, kopyalanırsa diller birbirinden kayar.
 */
export default async function ProductPage({ params }: ProductPageProps) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t: Messages = messages[locale];
  const [product, device] = await Promise.all([getProductDetail(locale, slug, null /* yer bağlamı sunucuya 19.7'de taşınacak — BEKLEYEN(19.7) */), detectDevice()]);
  if (!product) notFound();

  /**
   * Yorum bölümünün verisi (17.1). Ürün bulunduktan SONRA okunur — 404'e düşecek bir sayfa için
   * yorum sorgusu atmanın anlamı yok. Üç okuma paralel: skor, ilk sayfa ve "bu müşteri yazabilir mi".
   *
   * `REVIEW_PAGE_SIZE` tasarımın kuralı: ürün detayda İLK ÜÇ yorum görünür, fazlası panele kalır.
   */
  const customerId = await currentCustomerId();
  const [score, page, eligibility] = await Promise.all([
    getProductScore(product.id),
    listProductReviews(product.id, undefined, REVIEW_PAGE_SIZE),
    getReviewEligibility(customerId, product.id),
  ]);

  return (
    <SiteFrame device={device} locale={locale} activeNav="catalog" mobileChrome="detail" back={{ label: t.back, href: '/catalog' }}>
      <ProductClient
        t={t}
        locale={locale}
        product={product}
        device={device}
        reviews={{
          score,
          reviews: page.rows,
          // Toplam YAZILI yorum sayısı skordan gelir: liste sayfalı, `rows.length` yalnız bu sayfayı
          // söyler ve "tümü" bağlantısı ona bakarsa hiç görünmezdi.
          total: score.ratingCount,
          canReview: eligibility.canReview,
          alreadyWrote: eligibility.existing !== null,
        }}
      />
    </SiteFrame>
  );
}
