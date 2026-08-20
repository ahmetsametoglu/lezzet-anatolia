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
  return {
    title: pack.name,
    // `description` ARTIK VAR: paylaşım kartı adı tek başına gösterse "Bayram Sofrası Paketi"
    // yazan çıplak bir kutu üretirdi. Paketin açıklaması boş olabilir (operatör girmemiş) — kapı
    // o hâlde alanı hiç yazmıyor.
    ...(pack.description ? { description: pack.description } : {}),
    alternates: localeAlternates('/package/[slug]', locale, { slug }),
    openGraph: openGraphOf({
      route: '/package/[slug]',
      locale,
      params: { slug },
      title: pack.name,
      description: pack.description,
      image: pack.image.url,
    }),
  };
}

export default async function PackagePage({ params, searchParams }: PackagePageProps) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  void recordPageView('/package/[slug]', await searchParams);

  const t: Messages = messages[locale];
  // Yer kapıya parametre (19.22) — gerekçe `packages/page.tsx` künyesinde. `generateMetadata`
  // BİLEREK yersiz kalıyor: başlık ve paylaşım kartı ziyaretçinin yerine göre değişmez, üstelik
  // meta üretimi çerez okursa sayfa dinamikleşir ve her paylaşım linki yeniden render edilir.
  const [pack, device] = await Promise.all([
    getPackageDetail(slug, locale, await readPlaceWarehouses()),
    detectDevice(),
  ]);
  if (!pack) notFound();

  return (
    <SiteFrame
      device={device}
      locale={locale}
      activeNav="packages"
      mobileChrome="detail"
      footer="slim"
      /* `detail` prop'u YOK (sekizinci tur): başlık çizilmez — görsel tepeye yaslı, geri düğmesi
         fotoğrafın üstünde (`package.mobile`), sepet çerçevenin `CartFab`ında. */
    >
      <PackageClient t={t} locale={locale} pack={pack} device={device} />
    </SiteFrame>
  );
}
