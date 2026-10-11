import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { customerBusiness, listPublicDeliveryAreas, readPublicDeliveryTerms } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import messages from '@lezzet/i18n/customer/delivery-zones';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { recordPageView } from '@/lib/analytics/page-view';
import { detectDevice } from '@/lib/device';
import { currentCustomerId } from '@/lib/guard';
import { localeAlternates } from '@/lib/seo/alternates';
import { openGraphOf } from '@/lib/seo/open-graph';
import { routing } from '@/i18n/routing';
import { DeliveryZonesClient } from './delivery-zones-client';

/**
 * Teslimat bölgeleri, native "Nerelere gidiyoruz" ekranının sayfası: liste müşterinin türüne göre süzülür ki toptancı kendi bölgelerini
 * görsün, kapanış cümlesinin ülkeleri kargo depolarından türer.
 */
interface DeliveryZonesPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: DeliveryZonesPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = messages[locale];
  return {
    title: t.title,
    description: t.intro,
    alternates: localeAlternates('/delivery-zones', locale),
    openGraph: openGraphOf({ route: '/delivery-zones', locale, title: t.title, description: t.intro }),
  };
}

export default async function DeliveryZonesPage({ params }: DeliveryZonesPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  void recordPageView('/delivery-zones');

  const db = serviceDb();
  const [device, customerId] = await Promise.all([detectDevice(), currentCustomerId()]);
  const [business, terms] = await Promise.all([customerBusiness(db, customerId), readPublicDeliveryTerms(db, customerId)]);
  const { areas } = await listPublicDeliveryAreas(db, business);

  return (
    <SiteFrame device={device} locale={locale} mobileTitle={messages[locale].title}>
      <DeliveryZonesClient locale={locale} device={device} areas={areas} shippingCountries={terms.shippingCountries} />
    </SiteFrame>
  );
}
