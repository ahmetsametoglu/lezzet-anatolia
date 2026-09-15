import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { localeAlternates } from '@/lib/seo/alternates';
import { openGraphOf } from '@/lib/seo/open-graph';
import { setRequestLocale } from 'next-intl/server';
import { detectDevice } from '@/lib/device';
import { getPackageDetail } from '@/lib/storefront/packages';
import { readPlaceWarehouses } from '@/lib/delivery/read-place';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { recordPageView } from '@/lib/analytics/page-view';
import { routing } from '@/i18n/routing';
import { PackageClient } from './package-client';
import type { Messages } from './package-types';
import messages from './messages.json';

interface PackagePageProps {
  params: Promise<{ locale: string; slug: string }>;
  /** Yalnız kampanya etiketleri için. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Ziyaretçi buraya siteyi hiç görmeden, sosyal medya linkiyle gelebilir; bu yüzden geri dönüş yolu
 * paket listesine bağlanır. Satılmayan paket 404: doğrudan linkle açılabilmesi listeden düşmeyi anlamsız kılardı.
 */
export async function generateMetadata({ params }: PackagePageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const pack = await getPackageDetail(slug, locale);
  if (!pack) return {};
  return {
    title: pack.name,
    // Açıklama paylaşım kartını çıplak bir ad kutusu olmaktan kurtarır; boşsa alan hiç yazılmaz.
    ...(pack.description ? { description: pack.description } : {}),
    alternates: localeAlternates('/package/[slug]', locale, { slug }),
    openGraph: openGraphOf({
      route: '/package/[slug]',
      locale,
      params: { slug },
      title: pack.name,
      description: pack.description,
      image: pack.image,
    }),
  };
}

export default async function PackagePage({ params, searchParams }: PackagePageProps) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  void recordPageView('/package/[slug]', await searchParams);

  const t: Messages = messages[locale];
  // Yer kapıya parametre olarak geçer. `generateMetadata` yersiz kalır: meta üretimi çerez okursa
  // sayfa dinamikleşir ve her paylaşım linki yeniden render edilir.
  const [pack, device] = await Promise.all([
    getPackageDetail(slug, locale, await readPlaceWarehouses()),
    detectDevice(),
  ]);
  if (!pack) notFound();

  return (
    <SiteFrame device={device} locale={locale} activeNav="packages">
      <PackageClient t={t} locale={locale} pack={pack} device={device} />
    </SiteFrame>
  );
}
