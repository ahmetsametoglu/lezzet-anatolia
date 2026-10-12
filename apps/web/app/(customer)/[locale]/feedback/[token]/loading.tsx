import type { Locale } from '@lezzet/i18n';
import feedbackCopy from '@lezzet/i18n/customer/feedback';
import { getLocale } from 'next-intl/server';
import { AppBar } from '@/components/customer/ui/app-bar';
import { BackButton } from '@/components/customer/ui/back-button';
import { BrandLogo } from '@/components/customer/ui/brand-logo';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { Skeleton, SkeletonRegion, SkeletonText } from '@/components/customer/ui/skeleton';
import { detectDevice } from '@/lib/device';

/**
 * Davet sunucuda açıldığı için e-postadaki bağlantıdan gelen müşteri bu kare olmadan boş sayfaya bakar. Telefonda listenin iskeleti
 * çizilir, başlık çubuğu gerçek basılır ki geri düğmesi beklerken de çalışsın.
 */
export default async function FeedbackLoading() {
  const [device, locale] = await Promise.all([detectDevice(), getLocale() as Promise<Locale>]);
  const copy = feedbackCopy[locale];

  if (device === 'mobile') {
    return (
      <SiteFrame device={device} locale={locale} mobileChrome="bare">
        <div className="flex flex-1 flex-col">
          <AppBar title={copy.title} left={<BackButton label={copy.back} fallback="/" />} />
          <SkeletonRegion>
            <div className="flex flex-col gap-3 px-4.5 pt-4.5">
              <Skeleton className="h-4 w-[40%]" />
              <Skeleton className="h-7 w-[68%]" />
              <Skeleton className="h-9 w-[72%] !rounded-soft" />
              <div className="mt-1 rounded-card bg-sand-250 px-4">
                {[0, 1, 2].map((row) => (
                  <div key={row} className={['flex items-center gap-4 py-4', row > 0 ? 'border-t-[1.5px] border-dashed border-sand-400' : ''].join(' ')}>
                    <Skeleton className="size-13 flex-none !rounded-full !bg-sand-300" />
                    <div className="flex flex-1 flex-col gap-1.5">
                      <Skeleton className="h-4 w-[70%] !bg-sand-300" />
                      <Skeleton className="h-3 w-[45%] !bg-sand-300" />
                    </div>
                    <Skeleton className="size-10.5 flex-none !rounded-full !bg-sand-300" />
                    <Skeleton className="size-10.5 flex-none !rounded-full !bg-sand-300" />
                  </div>
                ))}
              </div>
              <Skeleton className="h-13 w-full !rounded-control" />
            </div>
          </SkeletonRegion>
        </div>
      </SiteFrame>
    );
  }

  return (
    <div className="flex min-h-screen justify-center bg-cream px-4 py-8">
      <div className="flex w-full max-w-[460px] flex-col items-center gap-3.5 py-6 text-center">
        <BrandLogo size="compact" alt="" />
        <p className="font-serif text-card-title leading-tight text-ink">{copy.title}</p>
        <SkeletonRegion>
          <div className="flex flex-col items-center gap-3.5">
            <SkeletonText lines={2} className="w-[300px] items-center" />
            <Skeleton className="mt-1 h-14 w-48 !rounded-pill" />
          </div>
        </SkeletonRegion>
      </div>
    </div>
  );
}
