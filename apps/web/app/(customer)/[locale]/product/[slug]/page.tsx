import type { Metadata } from 'next';
import { cache } from 'react';
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
import { availabilityOf, findActiveProduct, getProductDetail } from '@lezzet/application';
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

/**
 * Sayfadaki yorum seçkisi — masaüstü tasarımı ALTI kart gösteriyor (üç sütun, iki satır); fazlası
 * "tümü" panelinde. Telefon görünümü seçkiyi kendi içinde üçe indirir: orada kartlar alt alta ve
 * altı yorum, benzer ürünleri ekranlarca aşağı iterdi.
 */
const REVIEW_PAGE_SIZE = 6;

/** Ürün satırı istek başına bir kez: detay okuması ile yorumlar aynı satırı bekler. */
const readActiveProduct = cache((slug: string) => findActiveProduct(serviceDb(), slug));

/**
 * Başlık bilgisi ile sayfa aynı ürünü okur; `cache` bunu istek başına tek okumaya indirir, yoksa ürün, fiyatları ve stokları iki kez
 * okunurdu. Yer ve görüş söz olarak geçer ki ürün okuması oturumun çözülmesini beklemesin.
 */
const readProduct = cache(async (locale: Locale, slug: string) =>
  getProductDetail(serviceDb(), {
    locale,
    slug,
    place: readPlaceWarehouses(),
    viewer: readPricingViewer(),
    product: readActiveProduct(slug),
  }),
);

interface ProductPageProps {
  params: Promise<{ locale: string; slug: string }>;
  /** Kampanya etiketleri (reklam bağlantısı sıkça doğrudan ürünü açar) ve paket kaleminin istediği boy (`variant`). */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Ürün yoksa ya da satışta değilse 404: aday/pasif ürünün doğrudan linkle açılabilmesi katalogdan
 * gizlemeyi anlamsız kılardı. Slug dilden bağımsız, bu yüzden `alternates` parametreyi olduğu gibi geçirir.
 */
export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const product = await readProduct(locale, slug);
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
  const query = await searchParams;
  void recordPageView('/product/[slug]', query);

  const t: Messages = messages[locale];
  // Yorumlar ürün satırı bulununca başlar: 404'e düşecek sayfa için yorum sorgusu atılmaz, fiyat ve stok okuması da beklenmez.
  const feedback = readActiveProduct(slug).then(
    (listed) =>
      listed &&
      Promise.all([
        getProductScore(listed.id),
        // Dil zorunlu: yorumlar okuyucunun dilinde gösterilir, orijinal korunur ve çeviri yanına konur.
        listProductReviews(listed.id, locale as PreferredLanguage, undefined, REVIEW_PAGE_SIZE),
        currentCustomerId().then((customerId) => getReviewEligibility(customerId, listed.id)),
      ]),
  );
  const [product, device, reviews] = await Promise.all([readProduct(locale, slug), detectDevice(), feedback]);
  if (!product || !reviews) notFound();
  const [score, page, eligibility] = reviews;

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

  return (
    <SiteFrame device={device} locale={locale} activeNav="catalog">
      {/* Puan yalnız gerçekten varsa yazılır: uydurma bir puan yapısal veride yaptırıma uğrar. */}
      <ProductJsonLd
        product={product}
        url={localizedUrl('/product/[slug]', locale as Locale, { slug })}
        rating={score.average !== null ? { average: score.average, count: score.totalCount } : null}
      />
      <ProductClient
        t={t}
        locale={locale}
        product={product}
        device={device}
        initialVariantId={typeof query.variant === 'string' ? query.variant : null}
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
