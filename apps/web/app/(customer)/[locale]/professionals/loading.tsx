import type { Locale } from '@lezzet/i18n';
import { getLocale } from 'next-intl/server';
import { PhoneSkeleton } from '@/components/customer/phone-kit/phone-skeleton';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { Skeleton, SkeletonBlock, SkeletonCard, SkeletonRegion, SkeletonText } from '@/components/customer/ui/skeleton';
import { detectDevice } from '@/lib/device';

/**
 * Başvuru durumu sunucuda okunduğu için bu kare olmadan ekran veri gelene kadar önceki sayfada kalır. Koyu kahraman tek parça bir
 * yüzey olduğu için tek blok çizilir; altında başvuru kartı.
 */
export default async function ProfessionalsLoading() {
  const [device, locale] = await Promise.all([detectDevice(), getLocale() as Promise<Locale>]);

  return (
    <SiteFrame device={device} locale={locale} activeNav="pro">
      <SkeletonRegion>
        {device === 'mobile' ? (
          <div className="flex flex-col">
            <PhoneSkeleton tone="deep" radius="none" className="h-[300px] w-full" />
            <div className="flex flex-col gap-3 px-4 py-4">
              <PhoneSkeleton radius="card" className="h-[360px] w-full" />
              <PhoneSkeleton className="h-11 w-full" />
            </div>
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
