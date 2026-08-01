import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { readPlaceWarehouseId } from '@/lib/delivery/read-place';
import { serviceDb, UserProfileService } from '@lezzet/database';
import type { Locale } from '@lezzet/i18n';
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
 * çağrılmaz; bugün fiyat/fırsat/paket stub, kaynak geldiğinde bu sayfa değişmez.
 */
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
  const [data, device] = await Promise.all([getHomeData(locale, await readPlaceWarehouseId()), detectDevice()]);

  return (
    <SiteFrame device={device} locale={locale}>
      <HomeClient t={t} locale={locale as Locale} data={data} device={device} />
    </SiteFrame>
  );
}
