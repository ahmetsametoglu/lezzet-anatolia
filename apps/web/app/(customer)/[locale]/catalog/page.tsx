import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { detectDevice } from '@/lib/device';
import { getCatalogData } from '@/lib/storefront/catalog';
import { CATALOG_SORTS, type CatalogSort } from '@/lib/storefront/storefront-types';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { routing } from '@/i18n/routing';
import { CatalogClient } from './catalog-client';
import type { Messages } from './catalog-types';
import messages from './messages.json';

interface CatalogPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ category?: string; sort?: string; offers?: string; shippable?: string; q?: string }>;
}

/**
 * Katalog sayfası (08.10). Süzgeç durumu URL'de yaşar — filtreli liste paylaşılabilir, geri tuşu
 * çalışır, ilk boya sunucudan tam gelir. Veri `lib/storefront/catalog` kapısından okunur; süzme ve
 * sayfalama SQL'de çözülür (keyset), listeye giren ürün sayısı istemci yükünü artırmaz.
 *
 * Çerçeve metinleri (duyuru şeridi, gezinme, arama) anasayfanın `messages.json`'undan gelir:
 * `SiteFrame` her sayfada aynı metni gösterir, kopyalanırsa diller birbirinden kayar.
 */
export default async function CatalogPage({ params, searchParams }: CatalogPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const { category, sort, offers, shippable, q } = await searchParams;
  const activeSort: CatalogSort = CATALOG_SORTS.includes(sort as CatalogSort) ? (sort as CatalogSort) : 'featured';
  const onlyOffers = offers === '1';
  // Kargo çipi URL'de yaşar: süzülmüş liste paylaşılabilir ve geri tuşu çalışır (offers ile aynı desen).
  const onlyShippable = shippable === '1';

  const t: Messages = messages[locale];
  const [data, device] = await Promise.all([
    getCatalogData(locale, { categorySlug: category, search: q, sort: activeSort, onlyOffers, onlyShippable }),
    detectDevice(),
  ]);

  return (
    <SiteFrame device={device} locale={locale} activeNav="catalog">
      <CatalogClient t={t} locale={locale} data={data} active={{ category, sort: activeSort, onlyOffers, onlyShippable }} device={device} search={q} />
    </SiteFrame>
  );
}
