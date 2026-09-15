import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { localizedUrl, type Locale } from '@lezzet/i18n';
import type { PreferredLanguage } from '@lezzet/types';
import { localeAlternates } from '@/lib/seo/alternates';
import { openGraphOf } from '@/lib/seo/open-graph';
import { ProductJsonLd } from '@/lib/seo/json-ld';
import { setRequestLocale } from 'next-intl/server';
import { readPlaceWarehouses } from '@/lib/delivery/read-place';
import { readPricingViewer } from '@/lib/storefront/read-viewer';
import { detectDevice } from '@/lib/device';
import { availabilityOf, getProductDetail } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { getProductScore, getReviewEligibility, listProductReviews } from '@/lib/feedback/product-feedback';
import { currentCustomerId } from '@/lib/guard';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { recordEvent } from '@/lib/analytics/record';
import { recordPageView } from '@/lib/analytics/page-view';
import { routing } from '@/i18n/routing';
import { ProductClient } from './product-client';
import type { Messages } from './product-types';
import messages from './messages.json';

/** Tasarım: ürün detayda ilk üç yorum; fazlası "tümü" panelinde. */
const REVIEW_PAGE_SIZE = 3;

interface ProductPageProps {
  params: Promise<{ locale: string; slug: string }>;
  /** Yalnız kampanya etiketleri için: reklam bağlantısı sıkça doğrudan ürünü açar. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Ürün yoksa ya da satışta değilse 404: aday/pasif ürünün doğrudan linkle açılabilmesi katalogdan
 * gizlemeyi anlamsız kılardı. Slug dilden bağımsız, bu yüzden `alternates` parametreyi olduğu gibi geçirir.
 */
export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const product = await getProductDetail(serviceDb(), { locale, slug, place: await readPlaceWarehouses(), viewer: await readPricingViewer() });
  if (!product) return {};

  return {
    title: product.name,
    ...(product.description ? { description: product.description } : {}),
    alternates: localeAlternates('/product/[slug]', locale, { slug }),
    /**
     * Paylaşım kartının görseli JSON-LD ile aynı fotoğraf; kart operatörün sohbet kadrajını, JSON-LD
     * özgün dosyayı alır. `type` `website`: `product` kartı fiyat/stok beklentisi doğurur.
     */
    openGraph: openGraphOf({
      route: '/product/[slug]',
      locale,
      params: { slug },
      title: product.name,
      description: product.description,
      image: product.image,
    }),
  };
}

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  void recordPageView('/product/[slug]', await searchParams);

  const t: Messages = messages[locale];
  const [product, device] = await Promise.all([
    getProductDetail(serviceDb(), { locale, slug, place: await readPlaceWarehouses(), viewer: await readPricingViewer() }),
    detectDevice(),
  ]);
  if (!product) notFound();

  // Prefetch/bot/personel elemesi kapıda: atıcı ne olduğunu söyler, neyin sayılacağına kapı karar verir.
  void recordEvent(
    {
      type: 'product_view',
      subjectType: 'product',
      subjectId: product.id,
      productId: product.id,
      availability: availabilityOf(product.variants),
    },
    // Kalıbı olay kendisi geçer: render anında kapının `referer` türetimi bir önceki sayfayı gösterir.
    { path: '/product/[slug]' },
  );

  /**
   * Yorumlar ürün bulunduktan sonra okunur: 404'e düşecek sayfa için yorum sorgusu atılmaz.
   */
  const customerId = await currentCustomerId();
  const [score, page, eligibility] = await Promise.all([
    getProductScore(product.id),
    // Dil zorunlu: yorumlar okuyucunun dilinde gösterilir, orijinal korunur ve çeviri yanına konur.
    listProductReviews(product.id, locale as PreferredLanguage, undefined, REVIEW_PAGE_SIZE),
    getReviewEligibility(customerId, product.id),
  ]);

  return (
    <SiteFrame
      device={device}
      locale={locale}
      activeNav="catalog"
      footer="slim"
    >
      {/* Puan yalnız gerçekten varsa yazılır: uydurma bir puan yapısal veride yaptırıma uğrar. */}
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
          // Yazılı yorum sayısı skordan gelir: liste sayfalı olduğu için `rows.length` yalnız bu sayfayı
          // söyler. `ratingCount` değil, çünkü yalnız yıldız veren müşteri yazılı yorum bırakmamıştır.
          total: score.commentCount,
          canReview: eligibility.canReview,
          alreadyWrote: eligibility.existing !== null,
        }}
      />
    </SiteFrame>
  );
}
