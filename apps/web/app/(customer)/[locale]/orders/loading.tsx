import type { Locale } from '@lezzet/i18n';
import { getLocale } from 'next-intl/server';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { Skeleton, SkeletonRegion } from '@/components/customer/ui/skeleton';
import { detectDevice } from '@/lib/device';
import messages from './messages.json';

/**
 * Sipariş listesi sunucuda okunduğu için bu kare olmadan ekran veri gelene kadar önceki sayfada kalır. Kartın kabuğu gerçek, gri
 * kalan yalnız numara, künye, durum, küçük resimler ve tutar; kart sayısı native iskeletininki.
 */
export default async function OrdersLoading() {
  const [device, locale] = await Promise.all([detectDevice(), getLocale() as Promise<Locale>]);
  const t = messages[locale];

  return (
    <SiteFrame
      device={device}
      locale={locale}
      accountChrome={{ nav: 'orders', back: { label: t.backToAccount, href: '/account' }, title: t.title }}
    >
      <SkeletonRegion>
        <div className={device === 'mobile' ? 'flex flex-col gap-3 px-4.5 pb-5' : 'mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 py-6'}>
          {[0, 1, 2].map((card) => (
            <div key={card} className="flex flex-col gap-2.5 rounded-card bg-sand-250 px-4 py-3.5">
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Skeleton className="h-4.5 w-[52%] !bg-sand-300" />
                  <Skeleton className="h-4 w-[70%] !bg-sand-300" />
                </div>
                <Skeleton className="h-7 w-[26%] !rounded-badge !bg-sand-300" />
              </div>
              <div className="flex pl-2.5">
                {[0, 1, 2].map((thumb) => (
                  <Skeleton key={thumb} className="-ml-2.5 size-10 !rounded-full border-[2.5px] border-sand-250 !bg-sand-300" />
                ))}
              </div>
              <div className="flex items-center justify-between gap-2.5 border-t-[1.5px] border-dashed border-sand-400 pt-2.5">
                <Skeleton className="h-5 w-[30%] !bg-sand-300" />
                <Skeleton className="h-4.5 w-[22%] !bg-sand-300" />
              </div>
            </div>
          ))}
        </div>
      </SkeletonRegion>
    </SiteFrame>
  );
}
