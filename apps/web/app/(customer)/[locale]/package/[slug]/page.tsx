import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { detectDevice } from '@/lib/device';
import { getPackageDetail } from '@/lib/storefront/packages';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { routing } from '@/i18n/routing';
import { PackageClient } from './package-client';
import type { Messages } from './package-types';
import messages from './messages.json';

interface PackagePageProps {
  params: Promise<{ locale: string; slug: string }>;
}

/**
 * Paket detay sayfası (05.5). Veri `lib/storefront/packages` kapısından TEK turda okunur.
 *
 * **Birincil senaryo sosyal medya linki:** ziyaretçi buraya siteyi hiç görmeden düşebilir, sayfa tek
 * başına ilk izlenim olabilir (`musteri-paket-detay.md §7`). Bu yüzden çerçeve tam gösterilir ve
 * geri dönüş yolu paket listesine bağlanır — gelen kişinin "buranın devamı var" görmesi gerekir.
 *
 * Satılmayan paket 404: pasif ya da kalemi satıştan kalkmış paketin doğrudan linkle açılabilmesi,
 * listeden düşmüş olmayı anlamsız kılardı (okuma bu kararı `listSellable` ile verir).
 */
export default async function PackagePage({ params }: PackagePageProps) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t: Messages = messages[locale];
  const [pack, device] = await Promise.all([getPackageDetail(slug, locale), detectDevice()]);
  if (!pack) notFound();

  return (
    <SiteFrame device={device} locale={locale} activeNav="packages" mobileChrome="detail" back={{ label: t.back, href: '/packages' }}>
      <PackageClient t={t} locale={locale} pack={pack} device={device} />
    </SiteFrame>
  );
}
