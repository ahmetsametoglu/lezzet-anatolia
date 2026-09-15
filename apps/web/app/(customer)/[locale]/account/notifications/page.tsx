import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { serviceDb } from '@lezzet/database';
import { listNotifications } from '@lezzet/application';
import { notificationsChannelName } from '@lezzet/types';
import { detectDevice } from '@/lib/device';
import { currentCustomerId } from '@/lib/guard';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { recordPageView } from '@/lib/analytics/page-view';
import { routing } from '@/i18n/routing';
import { NotificationsClient } from './notifications-client';
import { NotificationsGuest } from './notifications-guest';
import { FEED_PAGE_SIZE, type Messages } from './notifications-types';
import messages from './messages.json';

/**
 * İlk sayfa sunucuda gelir, devamı (canlılık, sayfalama) istemcide. Satır metin taşımaz; cümle istemcide mobille aynı
 * sözlükten kurulur.
 */
interface NotificationsPageProps {
  params: Promise<{ locale: string }>;
}

export default async function NotificationsPage({ params }: NotificationsPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  void recordPageView('/account/notifications');

  const t: Messages = messages[locale];
  const [device, customerId] = await Promise.all([detectDevice(), currentCustomerId()]);
  const chrome = { back: { label: t.back, href: '/account' as const }, title: t.title };

  if (!customerId) {
    // Telefonda misafir sayfada kalır ve doğrulama davetini görür (tasarım); masaüstü girişe yönlenir.
    if (device === 'desktop') redirect(`/${locale}${routing.pathnames['/login'][locale]}`);
    return (
      <SiteFrame device={device} locale={locale} accountChrome={chrome}>
        <NotificationsGuest copy={t.guest} next={`/${locale}${routing.pathnames['/account/notifications'][locale]}`} />
      </SiteFrame>
    );
  }

  const feed = await listNotifications(serviceDb(), { profileId: customerId, audience: 'customer', limit: FEED_PAGE_SIZE });

  return (
    <SiteFrame device={device} locale={locale} accountChrome={chrome}>
      <NotificationsClient
        t={t}
        locale={locale}
        first={{
          // İç alanlar RSC teline çıkmaz: sözleşmenin daraltması.
          rows: feed.rows.map((row) => ({
            id: row.id,
            kind: row.kind,
            targetType: row.targetType,
            targetId: row.targetId,
            payload: row.payload,
            createdAt: row.createdAt,
            readAt: row.readAt,
          })),
          nextCursor: feed.nextCursor,
          unread: feed.unread,
        }}
        channel={notificationsChannelName(customerId)}
      />
    </SiteFrame>
  );
}
