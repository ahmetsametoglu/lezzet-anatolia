import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { localeAlternates } from '@/lib/seo/alternates';
import { openGraphOf } from '@/lib/seo/open-graph';
import { setRequestLocale } from 'next-intl/server';
import { detectDevice } from '@/lib/device';
import { listStorefrontPackages } from '@/lib/storefront/packages';
import { readSiteImage } from '@/lib/storefront/site-image';
import { readPlaceWarehouses } from '@/lib/delivery/read-place';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { recordPageView } from '@/lib/analytics/page-view';
import { routing } from '@/i18n/routing';
import { PackagesClient } from './packages-client';
import type { Messages } from './packages-types';
import messages from './messages.json';

interface PackagesPageProps {
  params: Promise<{ locale: string }>;
  /** Yalnız kampanya etiketleri için: paket kampanyasının bağlantısı doğrudan bu sayfayı açar. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Liste yönetimin kurduğu bir seçkidir: süzgeç, arama, sıralama yok. Küme operatörün elle kurduğu,
 * doğal tavanı olan bir küme olduğu için tek turda okunur.
 */
export async function generateMetadata({ params }: PackagesPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = messages[locale];
  // Açıklama sayfanın kendi giriş metni: kök layout'un genel cümlesi her sayfada aynı kalırdı.
  return {
    title: t.title,
    description: t.heroBody,
    alternates: localeAlternates('/packages', locale),
    openGraph: openGraphOf({ route: '/packages', locale, title: t.title, description: t.heroBody }),
  };
}

export default async function PackagesPage({ params, searchParams }: PackagesPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  void recordPageView('/packages', await searchParams);

  const t: Messages = messages[locale];
  // Yer kapıya parametre olarak geçer: istek bağlamına bağlı okuma kapının içinde olsaydı kapı istek
  // dışından (cron, webhook, mobil uç) çağrılamazdı.
  const [packages, hero, device] = await Promise.all([
    listStorefrontPackages(locale, undefined, await readPlaceWarehouses()),
    readSiteImage('packages_hero', locale),
    detectDevice(),
  ]);

  return (
    <SiteFrame device={device} locale={locale} activeNav="packages">
      <PackagesClient t={t} locale={locale} packages={packages} hero={hero} device={device} />
    </SiteFrame>
  );
}
