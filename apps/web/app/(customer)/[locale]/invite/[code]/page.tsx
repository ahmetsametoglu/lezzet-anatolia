import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { readInviteWelcome } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import inviteCopy from '@lezzet/i18n/customer/invite';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { detectDevice } from '@/lib/device';
import { currentCustomerId } from '@/lib/guard';
import { recordPageView } from '@/lib/analytics/page-view';
import { routing } from '@/i18n/routing';
import { InviteClient } from './invite-client';
import type { Messages } from './invite-types';
import messages from './messages.json';

/**
 * Paylaşılan davet bağlantısının indiği yer. Tanınmayan kod 404 değildir, çünkü bağlantıyı açan ziyaretçidir ve kırpılmış bir
 * bağlantı onu kapıdan çevirmemeli; davet edenin yalnız adı görünür, çünkü bağlantı tanımadığımız kanallarda dolaşır.
 */
interface InvitePageProps {
  params: Promise<{ locale: string; code: string }>;
}

export async function generateMetadata({ params }: InvitePageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t: Messages = messages[locale];
  // Kod başkasının künyesi: sayfa aramada olmaz, dil karşılıkları da bildirilmez.
  return { title: t.meta.title, description: t.meta.description, robots: { index: false, follow: false } };
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { locale, code } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  void recordPageView('/invite/[code]');

  const copy = inviteCopy[locale];
  const [device, viewerId] = await Promise.all([detectDevice(), currentCustomerId()]);
  const welcome = await readInviteWelcome(serviceDb(), code, viewerId);

  return (
    <SiteFrame device={device} locale={locale} mobileTitle={copy.title}>
      <InviteClient device={device} locale={locale} code={code} welcome={welcome} copy={copy} />
    </SiteFrame>
  );
}
