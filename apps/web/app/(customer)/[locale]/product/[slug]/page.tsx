import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { localizedUrl, type Locale } from '@lezzet/i18n';
import type { PreferredLanguage } from '@lezzet/types';
import { localeAlternates } from '@/lib/seo/alternates';
import { ProductJsonLd } from '@/lib/seo/json-ld';
import { setRequestLocale } from 'next-intl/server';
import { readPlaceWarehouses } from '@/lib/delivery/read-place';
import { readPricingViewer } from '@/lib/storefront/read-viewer';
import { detectDevice } from '@/lib/device';
import { getProductDetail } from '@/lib/storefront/product';
import { getProductScore, getReviewEligibility, listProductReviews } from '@/lib/feedback/product-feedback';
import { currentCustomerId } from '@/lib/guard';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { recordEvent } from '@/lib/analytics/record';
import { recordPageView } from '@/lib/analytics/page-view';
import { availabilityOf } from '@/lib/analytics/availability';
import { routing } from '@/i18n/routing';
import { ProductClient } from './product-client';
import type { Messages } from './product-types';
import messages from './messages.json';

/** Tasarım: ürün detayda ilk ÜÇ yorum; fazlası "tümü" panelinde (design/BACKLOG §1). */
const REVIEW_PAGE_SIZE = 3;

interface ProductPageProps {
  params: Promise<{ locale: string; slug: string }>;
  /** Yalnız kampanya etiketleri için (08.9) — reklam bağı sıkça doğrudan ürüne iner. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
/**
 * Ürün sayfasının başlığı, açıklaması ve `hreflang`ı (08.1).
 *
 * Slug DİLDEN BAĞIMSIZ (`PATHNAMES` künyesi: içerikten türer), yani üç dilin karşılığı aynı slug'ı
 * taşır ve yalnız segment kelimesi değişir (`/produit/…` · `/urun/…`). Bu yüzden `alternates`
 * parametreyi olduğu gibi geçirebiliyor — dil başına ayrı slug çözmek gerekmiyor.
 *
 * Ürün bulunamazsa boş dönülüyor: sayfa zaten 404 verecek, meta üretmek için ikinci bir sorgu
 * atmanın anlamı yok. Next iki çağrıyı da aynı istekte önbellekliyor, yani ürün okuması iki kez
 * yapılmıyor.
 */
export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const product = await getProductDetail(locale, slug, await readPlaceWarehouses(), await readPricingViewer());
  if (!product) return {};

  return {
    title: product.name,
    ...(product.description ? { description: product.description } : {}),
    alternates: localeAlternates('/product/[slug]', locale, { slug }),
  };
}

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  void recordPageView(await searchParams);

  const t: Messages = messages[locale];
  const [product, device] = await Promise.all([
    getProductDetail(locale, slug, await readPlaceWarehouses(), await readPricingViewer()),
    detectDevice(),
  ]);
  if (!product) notFound();

  // Ürün görüntülemesi (08.9). Prefetch/bot/personel elemesi KAPIDA — atıcı ne olduğunu söyler,
  // neyin sayılacağına kapı karar verir (`ANALYTICS §4`).
  void recordEvent({
    type: 'product_view',
    subjectType: 'product',
    subjectId: product.id,
    productId: product.id,
    availability: availabilityOf(product.variants),
  });

  /**
   * Yorum bölümünün verisi (17.1). Ürün bulunduktan SONRA okunur — 404'e düşecek bir sayfa için
   * yorum sorgusu atmanın anlamı yok. Üç okuma paralel: skor, ilk sayfa ve "bu müşteri yazabilir mi".
   *
   * `REVIEW_PAGE_SIZE` tasarımın kuralı: ürün detayda İLK ÜÇ yorum görünür, fazlası panele kalır.
   */
  const customerId = await currentCustomerId();
  const [score, page, eligibility] = await Promise.all([
    getProductScore(product.id),
    // Dil ZORUNLU: yorumlar okuyucunun dilinde gösteriliyor (20.2 — orijinal korunur, çeviri yanına konur).
    listProductReviews(product.id, locale as PreferredLanguage, undefined, REVIEW_PAGE_SIZE),
    getReviewEligibility(customerId, product.id),
  ]);

  return (
    <SiteFrame
      device={device}
      locale={locale}
      activeNav="catalog"
      mobileChrome="detail"
      back={{ label: t.back, href: '/catalog' }}
      share={{ subjectType: 'product', subjectId: product.id, productId: product.id }}
    >
      {/* Yapısal veri (08.1): arama sonucunda fiyat, stok ve puanın görünmesini sağlar. Puan
          YALNIZ gerçekten varsa yazılıyor — `average` null ise (hiç beyan yok) blok hiç doğmuyor,
          çünkü uydurma bir puan yapısal veride yaptırıma uğrar. */}
      <ProductJsonLd
        product={product}
        locale={locale as Locale}
        url={localizedUrl('/product/[slug]', locale as Locale, { slug })}
        rating={score.average !== null ? { average: score.average, count: score.totalCount } : null}
      />
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
          //
          // **`commentCount`, `ratingCount` DEĞİL** (04.08 düzeltmesi). Satırın künyesi baştan beri
          // "YAZILI yorum sayısı" diyordu ama geçirilen değer yıldız sayısıydı; form yıldız YA DA
          // metin kabul ettiği için (ikisinden biri yeterli) yalnız yıldız veren müşteriler de o
          // sayıya giriyordu. 20 yıldız + 2 yazılı yorumu olan üründe bağ "20 yorumun tümü" der,
          // panel 2 yorum gösterirdi. Alan motorda yoktu, arka uçtan istendi ve geldi.
          total: score.commentCount,
          canReview: eligibility.canReview,
          alreadyWrote: eligibility.existing !== null,
        }}
      />
    </SiteFrame>
  );
}
