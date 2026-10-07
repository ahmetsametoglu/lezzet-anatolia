import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { readNeighborWelcome } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import neighborCopy from '@lezzet/i18n/customer/neighbor';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { detectDevice } from '@/lib/device';
import { currentCustomerId } from '@/lib/guard';
import { recordPageView } from '@/lib/analytics/page-view';
import { routing } from '@/i18n/routing';
import { NeighborClient } from './neighbor-client';
import type { Messages } from './neighbor-types';
import messages from './messages.json';

/**
 * Komşu davetinin indiği yer: davet bir teslimat gününe çağırır ve kesim saatinde biter, bu yüzden her hâlde gün görünür ve her
 * hâl alışverişe devamla biter. Tanınmayan belirteç 404 değildir, çünkü bağlantıyı açan ziyaretçidir; davet edenin yalnız adı görünür.
 */
interface NeighborPageProps {
  params: Promise<{ locale: string; token: string }>;
}

export async function generateMetadata({ params }: NeighborPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t: Messages = messages[locale];
  // Belirteç başkasının künyesidir ve tek giriş yolu paylaşılan bağlantı: sayfa aramada olmaz.
  return { title: t.meta.title, description: t.meta.description, robots: { index: false, follow: false } };
}

export default async function NeighborInvitePage({ params }: NeighborPageProps) {
  const { locale, token } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  void recordPageView('/neighbor/[token]');

  const copy = neighborCopy[locale];
  const [device, viewerId] = await Promise.all([detectDevice(), currentCustomerId()]);
  const welcome = await readNeighborWelcome(serviceDb(), token, viewerId);

  return (
    <SiteFrame device={device} locale={locale} mobileTitle={copy.title}>
      <NeighborClient device={device} locale={locale} token={token} welcome={welcome} copy={copy} desktop={messages[locale].desktop} />
    </SiteFrame>
  );
}
