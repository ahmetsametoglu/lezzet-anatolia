import type { Locale } from '@lezzet/i18n';
import { getLocale } from 'next-intl/server';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { detectDevice } from '@/lib/device';
import { DesktopSupportSkeleton, PhoneTicketsSkeleton } from './components/support-skeleton';
import messages from './messages.json';

/**
 * Talepler sunucuda okunduğu için bu kare olmadan ekran veri gelene kadar önceki sayfada kalır. Başlık çubuğu gerçek; "yeni talep"
 * eylemi yalnız dolu listede çizildiği için iskelette yok.
 */
export default async function SupportLoading() {
  const [device, locale] = await Promise.all([detectDevice(), getLocale() as Promise<Locale>]);
  const t = messages[locale];

  return (
    <SiteFrame
      device={device}
      locale={locale}
      accountChrome={{ nav: 'support', back: { label: t.backToAccount, href: '/account' }, title: t.title }}
      fill
    >
      {device === 'mobile' ? <PhoneTicketsSkeleton /> : <DesktopSupportSkeleton />}
    </SiteFrame>
  );
}
