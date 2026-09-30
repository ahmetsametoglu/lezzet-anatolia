import discoverCopy from '@lezzet/i18n/customer/discover';
import type { Locale } from '@lezzet/i18n';
import { getLocale } from 'next-intl/server';
import { PhoneSkeleton } from '@/components/customer/phone-kit/phone-skeleton';
import { AppBar } from '@/components/customer/ui/app-bar';
import { BackButton } from '@/components/customer/ui/back-button';
import { Band } from '@/components/customer/ui/section';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { Skeleton, SkeletonBlock, SkeletonRegion, SkeletonText } from '@/components/customer/ui/skeleton';
import { detectDevice } from '@/lib/device';
import messages from './messages.json';

/**
 * Oylanacak kartlar sunucuda okunduğu için bu kare olmadan ekran veri gelene kadar önceki sayfada kalır. Başlık çubuğu gerçek;
 * deste ve iki oy düğmesinin yeri sayfanın ölçüsüyle.
 */
export default async function DiscoverLoading() {
  const [device, locale] = await Promise.all([detectDevice(), getLocale() as Promise<Locale>]);
  const t = messages[locale];

  return (
    <SiteFrame
      device={device}
      locale={locale}
      activeNav="discover"
      mobileChrome="bare"
      thinChrome={{ title: t.title, fallback: '/catalog' }}
    >
      {device === 'mobile' ? (
        <div className="flex flex-1 flex-col bg-sand-50">
          <AppBar title={discoverCopy[locale].title} left={<BackButton label={discoverCopy[locale].back} fallback="/catalog" />} />
          <SkeletonRegion>
            <div className="flex flex-col gap-3 px-4.5 pt-3">
              <PhoneSkeleton className="h-1.5 w-full" />
              <PhoneSkeleton radius="none" className="h-[440px] w-full rounded-[28px]" />
              <div className="flex items-center justify-center gap-6 pt-0.5 pb-1.5">
                <PhoneSkeleton className="size-15" />
                <PhoneSkeleton className="size-18" />
              </div>
            </div>
          </SkeletonRegion>
        </div>
      ) : (
        <Band surface="bg-olive-bg" className="flex min-h-[520px] flex-1 flex-col gap-6 px-12 pt-7.5 pb-11">
          <SkeletonRegion>
            <div className="flex flex-col gap-6">
              <div className="flex max-w-[520px] flex-col gap-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-1.5 w-full" />
              </div>
              <div className="grid grid-cols-[1.15fr_1fr] items-stretch gap-10">
                <SkeletonBlock className="aspect-[4/3] !rounded-card" />
                <div className="flex flex-col gap-4 py-2">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-11 w-3/4" />
                  <SkeletonText lines={3} />
                  <div className="flex gap-3">
                    <Skeleton className="h-12 w-40 !rounded-pill" />
                    <Skeleton className="h-12 w-40 !rounded-pill" />
                  </div>
                </div>
              </div>
            </div>
          </SkeletonRegion>
        </Band>
      )}
    </SiteFrame>
  );
}
