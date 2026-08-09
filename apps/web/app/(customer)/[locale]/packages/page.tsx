import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { localeAlternates } from '@/lib/seo/alternates';
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
  /** Yalnız kampanya etiketleri için (08.9) — paket kampanyası doğrudan buraya iner. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Paketler sayfası (05.5'in müşteri tarafı).
 *
 * Süzgeç/arama/sıralama YOK ve URL'de durum taşımaz: liste yönetimin kurduğu bir SEÇKİdir. Bu
 * yüzden sayfa `searchParams` almaz — katalogdan ayrıldığı yer burası.
 *
 * Veri tek turda okunur: paket kümesi operatörün elle kurduğu, doğal tavanı olan bir kümedir
 * (CLAUDE.md §1) — veriyle büyümez, keyset sayfalama gerektirmez. Tasarımın "12 + Daha fazla"
 * düzeni bir gösterim kararıdır ve ekranda çözülür.
 */
/** Başlık ve `hreflang` (08.1) — üç dilin karşılıkları `routing.ts` tablosundan türer. */
export async function generateMetadata({ params }: PackagesPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  return { title: messages[locale].title, alternates: localeAlternates('/packages', locale) };
}

export default async function PackagesPage({ params, searchParams }: PackagesPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  void recordPageView('/packages', await searchParams);

  const t: Messages = messages[locale];
  // Yer KAPIYA parametre olarak geçer, kapının içinde okunmaz (19.22): istek bağlamına bağlı bir
  // okumayı orkestrasyonun içine koymak onu istek DIŞINDA çağrılamaz hâle getirir (cron/webhook/
  // mobil uç) — ölçülmüş bir hata, 34 test düşürmüştü (`settings-scope.ts` künyesi). Çerezi okuyan
  // taraf sayfadır. Yer bilinmiyorsa kapı bugünküyle birebir aynı davranır (`route: null`).
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
