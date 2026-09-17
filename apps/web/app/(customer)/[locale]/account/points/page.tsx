import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { serviceDb } from '@lezzet/database';
import { readCustomerPointsHistory, readPointsRules } from '@lezzet/application';
import { detectDevice } from '@/lib/device';
import { currentCustomerId } from '@/lib/guard';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { recordPageView } from '@/lib/analytics/page-view';
import { routing } from '@/i18n/routing';
import { PointsHistoryClient } from './points-client';
import { POINTS_PAGE_SIZE, type Messages } from './points-types';
import messages from './messages.json';

/**
 * Puan geçmişi: kazanma yolları ayardan gelir (`readPointsRules`), çünkü ekrana gömülü sayı motorun uyguladığından bir gün
 * ayrışırdı. Girişsiz ziyaretçi girişe, program dışı (B2B) profil hesaba döner; onun hesabında puan bölümü hiç yok.
 */
interface PointsPageProps {
  params: Promise<{ locale: string }>;
}

export default async function PointsHistoryPage({ params }: PointsPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  void recordPageView('/account/points');

  const t: Messages = messages[locale];
  const [device, customerId] = await Promise.all([detectDevice(), currentCustomerId()]);
  if (!customerId) redirect(`/${locale}${routing.pathnames['/login'][locale]}`);

  const db = serviceDb();
  const [history, rules] = await Promise.all([
    readCustomerPointsHistory(db, { customerId, limit: POINTS_PAGE_SIZE }),
    readPointsRules(db),
  ]);
  if (history.status !== 'ok') redirect(`/${locale}${routing.pathnames['/account'][locale]}`);

  return (
    <SiteFrame device={device} locale={locale} accountChrome={{ back: { label: t.back, href: '/account' }, title: t.title }}>
      <PointsHistoryClient
        t={t}
        locale={locale}
        first={{ entries: history.entries, nextCursor: history.nextCursor ?? null }}
        rules={rules}
      />
    </SiteFrame>
  );
}
