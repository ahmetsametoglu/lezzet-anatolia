import supportMessages from '@lezzet/i18n/customer/support';
import type { Locale } from '@lezzet/i18n';
import { getLocale } from 'next-intl/server';
import { PhoneSkeleton } from '@/components/customer/phone-kit/phone-skeleton';
import { AppBar } from '@/components/customer/ui/app-bar';
import { BackButton } from '@/components/customer/ui/back-button';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { detectDevice } from '@/lib/device';
import { DesktopSupportSkeleton, PhoneTicketThreadSkeleton } from '../components/support-skeleton';
import messages from '../messages.json';

/**
 * Yazışma sunucuda okunduğu için bu kare olmadan ekran veri gelene kadar önceki sayfada kalır. Talebin adı ve durumu veriden
 * geldiği için başlıkta boş durur; geri yolu gerçek.
 */
export default async function TicketLoading() {
  const [device, locale] = await Promise.all([detectDevice(), getLocale() as Promise<Locale>]);
  const t = messages[locale];

  return (
    <SiteFrame
      device={device}
      locale={locale}
      accountChrome={{ nav: 'support', back: { label: t.backToList, href: '/support' }, title: '' }}
      fill
    >
      {device === 'mobile' ? (
        <div className="flex h-full min-h-0 flex-col">
          <AppBar
            title=""
            left={<BackButton label={supportMessages[locale].back} fallback="/support" />}
            right={<PhoneSkeleton radius="control" className="h-6 w-20" />}
          />
          <PhoneTicketThreadSkeleton />
        </div>
      ) : (
        <DesktopSupportSkeleton />
      )}
    </SiteFrame>
  );
}
