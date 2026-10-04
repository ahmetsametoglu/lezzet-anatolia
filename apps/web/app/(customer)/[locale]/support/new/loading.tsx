import type { Locale } from '@lezzet/i18n';
import { getLocale } from 'next-intl/server';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { Skeleton, SkeletonRegion } from '@/components/customer/ui/skeleton';
import { detectDevice } from '@/lib/device';
import { PhoneTicketsSkeleton } from '../components/support-skeleton';
import messages from '../messages.json';

/**
 * Form açılmadan siparişler okunduğu için bu kare olmadan ekran önceki sayfada kalır. Telefonda çekmece listenin üstünde açıldığı için
 * kare listenin karesidir; masaüstünde başlık siparişten gelinip gelinmediğine göre değiştiği için boş durur.
 */
export default async function NewTicketLoading() {
  const [device, locale] = await Promise.all([detectDevice(), getLocale() as Promise<Locale>]);
  const t = messages[locale];

  if (device === 'mobile') {
    return (
      <SiteFrame
        device={device}
        locale={locale}
        accountChrome={{ nav: 'support', back: { label: t.backToAccount, href: '/account' }, title: t.title }}
        fill
      >
        <PhoneTicketsSkeleton />
      </SiteFrame>
    );
  }

  return (
    <SiteFrame
      device={device}
      locale={locale}
      accountChrome={{ nav: 'support', back: { label: t.backToList, href: '/support' }, title: '' }}
    >
      <SkeletonRegion>
        <div className="mx-auto flex w-[560px] flex-col gap-3.5 py-8">
          <Skeleton className="h-4 w-2/3" />
          <div className="flex gap-2.5">
            <Skeleton className="h-11 flex-1 !rounded-pill" />
            <Skeleton className="h-11 flex-1 !rounded-pill" />
          </div>
        </div>
      </SkeletonRegion>
    </SiteFrame>
  );
}
