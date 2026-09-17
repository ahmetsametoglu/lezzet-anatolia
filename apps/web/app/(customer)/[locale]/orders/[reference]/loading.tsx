import type { Locale } from '@lezzet/i18n';
import { getLocale } from 'next-intl/server';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { Skeleton, SkeletonRegion } from '@/components/customer/ui/skeleton';
import { detectDevice } from '@/lib/device';
import messages from './messages.json';

/**
 * Sipariş detayı sunucuda okunduğu için bu kare olmadan ekran veri gelene kadar önceki sayfada kalır. Yalnız her siparişte olan
 * bölümler çizilir (dört duraklı zaman çizgisi, kalemler, tutar özeti); numara henüz bilinmediği için başlık boş kalır.
 */
export default async function OrderDetailLoading() {
  const [device, locale] = await Promise.all([detectDevice(), getLocale() as Promise<Locale>]);
  const t = messages[locale];

  return (
    <SiteFrame device={device} locale={locale} accountChrome={{ back: { label: t.back, href: '/orders' }, title: '' }}>
      <SkeletonRegion>
        <div
          className={
            device === 'mobile' ? 'flex flex-col gap-4 px-4.5 pt-4.5 pb-7.5' : 'mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-6'
          }
        >
          <div className="flex flex-col rounded-card bg-sand-250 px-4 pt-4 pb-1">
            {[0, 1, 2, 3].map((step) => (
              <div key={step} className="flex gap-3">
                <div className="flex flex-none flex-col items-center">
                  <Skeleton className="size-8.5 !rounded-full !bg-sand-300" />
                  {step < 3 && <span aria-hidden className="my-0.5 min-h-4 w-[2.5px] flex-1 rounded-full bg-sand-400" />}
                </div>
                <div className="flex min-w-0 flex-1 flex-col pb-3.5">
                  <Skeleton className="h-4.5 w-[46%] !bg-sand-300" />
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <Skeleton className="h-3.5 w-[32%]" />
            {[0, 1, 2].map((line) => (
              <div key={line} className="flex items-center gap-3 border-b-[1.5px] border-dashed border-sand-400 py-2.5">
                <Skeleton className="size-11.5 flex-none !rounded-full" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Skeleton className="h-4.5 w-[72%]" />
                  <Skeleton className="h-3.5 w-[44%]" />
                </div>
                <Skeleton className="h-4.5 w-[18%]" />
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 rounded-control bg-sand-150 px-4 py-3.5">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="flex justify-between gap-2.5">
                <Skeleton className="h-4.5 w-[38%] !bg-sand-300" />
                <Skeleton className="h-4.5 w-[24%] !bg-sand-300" />
              </div>
            ))}
            <div className="flex items-center justify-between border-t-[1.5px] border-dashed border-sand-400 pt-2.5">
              <Skeleton className="h-5 w-[26%] !bg-sand-300" />
              <Skeleton className="h-11 w-[34%] !rounded-badge !bg-sand-300" />
            </div>
          </div>
        </div>
      </SkeletonRegion>
    </SiteFrame>
  );
}
