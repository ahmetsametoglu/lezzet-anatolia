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
import { FEED_PAGE_SIZE, type Messages } from './notifications-types';
import messages from './messages.json';

/**
 * Bildirim akışı (14.15) — hesap zilinin listesi; native uygulamanın bildirim ekranının web'deki
 * eşi. Satır metin taşımaz (14.12): cümle istemcide `notificationSentence` ile kurulur — mobille
 * AYNI sözlük (`@lezzet/i18n`), aynı satır iki yüzeyde aynı cümleyi kurar.
 *
 * İlk sayfa SUNUCUDA gelir (puan sayfasının deseni): açılışta satırlar + imleç + rozet tek turda.
 * Kural `@lezzet/application`da (mobil uçla aynı kapı); devamı istemcide — canlılık, iyimser
 * yazımlar ve sayfalama `notifications-client` künyesinde.
 *
 * Girişsiz ziyaretçi girişe yönlenir (hesap sayfasının kuralı: sayfa sır değil, eksik olan kimlik).
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
  if (!customerId) redirect(`/${locale}${routing.pathnames['/login'][locale]}`);

  const feed = await listNotifications(serviceDb(), { profileId: customerId, audience: 'customer', limit: FEED_PAGE_SIZE });

  return (
    <SiteFrame device={device} locale={locale} accountChrome={{ back: { label: t.back, href: '/account' }, title: t.title }}>
      <NotificationsClient
        t={t}
        locale={locale}
        first={{
          // Daraltma sözleşmenin kendisi (`me-notifications.schema` künyesi): iç alanlar RSC teline çıkmaz.
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
