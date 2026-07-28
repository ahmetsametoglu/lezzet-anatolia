import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { detectDevice } from '@/lib/device';
import { getProductDetail } from '@/lib/storefront/product';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { routing } from '@/i18n/routing';
import { ProductClient } from './product-client';
import type { Messages } from './product-types';
import messages from './messages.json';

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
  const [product, device] = await Promise.all([getProductDetail(locale, slug), detectDevice()]);
  if (!product) notFound();

  return (
    <SiteFrame device={device} locale={locale} activeNav="catalog" mobileChrome="detail" back={{ label: t.back, href: '/catalog' }}>
      <ProductClient t={t} locale={locale} product={product} device={device} />
    </SiteFrame>
  );
}
