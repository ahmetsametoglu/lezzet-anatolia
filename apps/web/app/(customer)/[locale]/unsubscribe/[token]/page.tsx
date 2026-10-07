import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { readEmailSubscription } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { detectDevice } from '@/lib/device';
import { recordPageView } from '@/lib/analytics/page-view';
import { routing } from '@/i18n/routing';
import { UnsubscribeClient } from './unsubscribe-client';
import type { Messages } from './unsubscribe-types';
import messages from './messages.json';

/**
 * Kampanya bilgi e-postasındaki düğmenin açtığı sayfa. Sunucu yalnız okur; kapatmayı sayfadaki form yapar, çünkü bağlantıyı açmak
 * niyet değildir ve önizleme botları da açar.
 */
interface UnsubscribePageProps {
  params: Promise<{ locale: string; token: string }>;
}

export async function generateMetadata({ params }: UnsubscribePageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t: Messages = messages[locale];
  // Jeton başkasının tercih anahtarıdır: sayfa aramada olmaz.
  return { title: t.meta.title, description: t.meta.description, robots: { index: false, follow: false } };
}

export default async function UnsubscribePage({ params }: UnsubscribePageProps) {
  const { locale, token } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  void recordPageView('/unsubscribe/[token]');

  const t: Messages = messages[locale];
  const [device, state] = await Promise.all([detectDevice(), readEmailSubscription(serviceDb(), token)]);

  return (
    <SiteFrame device={device} locale={locale} mobileTitle={t.eyebrow}>
      <UnsubscribeClient device={device} locale={locale} token={token} state={state} t={t} />
    </SiteFrame>
  );
}
