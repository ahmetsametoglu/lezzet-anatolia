import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { readPlaceWarehouses } from '@/lib/delivery/read-place';
import { readPricingViewer } from '@/lib/storefront/read-viewer';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { localizedUrl, type Locale } from '@lezzet/i18n';
import { localeAlternates } from '@/lib/seo/alternates';
import { LocalBusinessJsonLd } from '@/lib/seo/json-ld';
import { getSessionUser } from '@/lib/guard';
import { detectDevice } from '@/lib/device';
import { getHomeData } from '@/lib/storefront/home';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { routing } from '@/i18n/routing';
import { HomeClient } from './home-client';
import type { Messages } from './home-types';
import messages from './messages.json';

interface HomeProps {
  params: Promise<{ locale: string }>;
}

/**
 * Vitrin ana sayfası (08.10). Veri `lib/storefront` KAPISINDAN okunur — servis burada doğrudan
 * çağrılmaz. Kapının arkasındaki kaynaklar değişse de bu sayfa değişmez; kaynakların bugünkü hâli
 * kapının kendi künyesinde yaşar (`storefront-types.ts`), burada tekrarlanmaz — iki yerde tutulan
 * bir durum listesinin biri mutlaka eskir (denetim M-Y2: burada tam olarak o olmuştu).
 */
/** Ana sayfanın `hreflang`ı (08.1). Başlık layout'tan gelir — marka adı burada tekrarlanmaz. */
export async function generateMetadata({ params }: HomeProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  return { alternates: localeAlternates('/', locale) };
}

export default async function Home({ params }: HomeProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  // İki-yüzey kuralı: personel ana sayfada karşılanmaz → Operasyon'a. (Vitrini görmek isterse
  // kataloğa doğrudan gidebilir; yalnız kök `/` yönlendirir.)
  const user = await getSessionUser();
  if (user && (await new UserProfileService(serviceDb()).isStaff(user.id))) {
    redirect('/operations');
  }

  const t: Messages = messages[locale];
  const [data, device] = await Promise.all([
    getHomeData(locale, await readPlaceWarehouses(), await readPricingViewer()),
    detectDevice(),
  ]);

  return (
    <SiteFrame device={device} locale={locale}>
      {/* İşletme künyesi YALNIZ ana sayfada (08.1): `LocalBusiness` sitenin tamamını tanıtır, her
          sayfada tekrarlamak aynı beyanı çoğaltmak olurdu. */}
      <LocalBusinessJsonLd url={localizedUrl('/', locale as Locale)} />
      <HomeClient t={t} locale={locale as Locale} data={data} device={device} />
    </SiteFrame>
  );
}
