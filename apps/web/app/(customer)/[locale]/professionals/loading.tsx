import type { Locale } from '@lezzet/i18n';
import { getLocale } from 'next-intl/server';
import { PhoneSkeleton } from '@/components/customer/phone-kit/phone-skeleton';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { Skeleton, SkeletonBlock, SkeletonCard, SkeletonRegion, SkeletonText } from '@/components/customer/ui/skeleton';
import { detectDevice } from '@/lib/device';

/**
 * Başvuru durumu sunucuda okunduğu için bu kare olmadan ekran veri gelene kadar önceki sayfada kalır. Koyu tanıtım tek parça bir
 * yüzey olduğu için tek blok çizilir.
 */
export default async function ProfessionalsLoading() {
  const [device, locale] = await Promise.all([detectDevice(), getLocale() as Promise<Locale>]);

  return (
    <SiteFrame device={device} locale={locale} activeNav="pro">
      <SkeletonRegion>
        {device === 'mobile' ? (
          <div className="flex flex-col gap-4 p-4.5 pb-7.5">
            <PhoneSkeleton tone="deep" radius="card" className="h-[198px] w-full" />
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((slot) => (
                <div key={slot} className="flex items-center gap-2.5">
                  <PhoneSkeleton className="size-6.5 flex-none" />
                  <PhoneSkeleton tone="soft" className="h-3.5 flex-1" />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <PhoneSkeleton radius="control" className="h-11.5 flex-1" />
              <PhoneSkeleton radius="control" className="h-11.5 flex-1" />
            </div>
            <div className="flex flex-col gap-2.5">
              <PhoneSkeleton tone="soft" className="h-3.5 w-full" />
              <PhoneSkeleton tone="soft" className="h-3.5 w-3/5" />
              <PhoneSkeleton className="mt-6 h-12.5 w-full" />
            </div>
            <div className="flex flex-col gap-2.5">
              <PhoneSkeleton tone="soft" className="h-4.5 w-1/3" />
              <PhoneSkeleton className="mt-6 h-12.5 w-full" />
              <PhoneSkeleton className="mt-6 h-12.5 w-full" />
            </div>
            <PhoneSkeleton radius="control" className="h-13 w-full" />
          </div>
        ) : (
          <div className="flex flex-col">
            <SkeletonBlock className="h-[420px] w-full !rounded-none" />
            <div className="grid grid-cols-3 gap-4 px-12 py-9">
              {[0, 1, 2].map((slot) => (
                <SkeletonCard key={slot}>
                  <Skeleton className="h-6 w-6" />
                  <Skeleton className="h-4 w-2/3" />
                  <SkeletonText lines={2} />
                </SkeletonCard>
              ))}
            </div>
            <div className="grid grid-cols-2 items-start gap-10 px-12 pb-12">
              <SkeletonBlock className="h-[420px] !rounded-card" />
              <SkeletonText lines={4} />
            </div>
          </div>
        )}
      </SkeletonRegion>
    </SiteFrame>
  );
}
