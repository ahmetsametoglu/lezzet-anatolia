import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { serviceDb } from '@lezzet/database';
import { preferencesSubjectOf, readNotificationPreferences, resolvePreferencesToken } from '@lezzet/application';
import { detectDevice } from '@/lib/device';
import { currentCustomerId } from '@/lib/guard';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { recordPageView } from '@/lib/analytics/page-view';
import { routing } from '@/i18n/routing';
import { PreferencesClient } from './preferences-client';
import type { Messages } from './preferences-types';
import messages from './messages.json';

/**
 * Her mailin altbilgisindeki bağın hedefi; oturum istemez, çünkü mailin alıcısı çoğu zaman girişli değildir ve izni geri almak
 * vermek kadar kolay olmalı. Oturum jetonu ezer ki paylaşılmış bir bağ girişli başka birine yabancı tercihleri açmasın.
 */
interface PreferencesPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ t?: string }>;
}

export default async function PreferencesPage({ params, searchParams }: PreferencesPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  void recordPageView('/account/preferences');

  const t: Messages = messages[locale];
  const [device, customerId, query] = await Promise.all([detectDevice(), currentCustomerId(), searchParams]);
  const token = query.t?.trim() || null;

  const db = serviceDb();
  // Oturum ÖNCE: girişli müşteri kendi kaydını görür, adresteki jeton ne olursa olsun.
  const subject = customerId
    ? await preferencesSubjectOf(db, customerId)
    : token
      ? await resolvePreferencesToken(db, token)
      : null;

  // Ne oturum ne jeton → ziyaretçi hiç bağ taşımadan gelmiştir; orası giriş sayfasının işi.
  if (!subject && !token) redirect(`/${locale}${routing.pathnames['/login'][locale]}`);

  const view = subject ? await readNotificationPreferences(db, subject) : null;

  return (
    <SiteFrame
      device={device}
      locale={locale}
      accountChrome={{ back: { label: t.back, href: '/account' }, title: t.title }}
    >
      <PreferencesClient t={t} locale={locale} view={view} token={token} />
    </SiteFrame>
  );
}
