import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { localeAlternates } from '@/lib/seo/alternates';
import { setRequestLocale } from 'next-intl/server';
import { detectDevice } from '@/lib/device';
import { getPackageDetail } from '@/lib/storefront/packages';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { recordPageView } from '@/lib/analytics/page-view';
import { routing } from '@/i18n/routing';
import { PackageClient } from './package-client';
import type { Messages } from './package-types';
import messages from './messages.json';

interface PackagePageProps {
  params: Promise<{ locale: string; slug: string }>;
  /** Yalnız kampanya etiketleri için (08.9). */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
/** Paket sayfasının başlığı ve `hreflang`ı (08.1) — slug dilden bağımsız, ürün sayfasıyla aynı kural. */
export async function generateMetadata({ params }: PackagePageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const pack = await getPackageDetail(slug, locale);
  if (!pack) return {};
  return { title: pack.name, alternates: localeAlternates('/package/[slug]', locale, { slug }) };
}

export default async function PackagePage({ params, searchParams }: PackagePageProps) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  void recordPageView('/package/[slug]', await searchParams);

  const t: Messages = messages[locale];
  const [pack, device] = await Promise.all([getPackageDetail(slug, locale), detectDevice()]);
  if (!pack) notFound();

  return (
    <SiteFrame
      device={device}
      locale={locale}
      activeNav="packages"
      mobileChrome="detail"
      back={{ label: t.back, href: '/packages' }}
      // Paket bir ürün DEĞİL: `productId` yok, çünkü paket birden çok ürünü tek fiyata sunuyor —
      // birini seçip ona yazmak ölçümü o ürüne haksızca yüklerdi.
      share={{ subjectType: 'bundle', subjectId: pack.id }}
    >
      <PackageClient t={t} locale={locale} pack={pack} device={device} />
    </SiteFrame>
  );
}
