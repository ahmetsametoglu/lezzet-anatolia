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
 * Davet sunucuda açıldığı için e-postadaki bağlantıdan gelen müşteri bu kare olmadan boş sayfaya bakar. Telefonda native'in oy aşaması
 * iskeleti çizilir (akış hep oyla başlar), başlık çubuğu gerçek basılır ki geri düğmesi beklerken de çalışsın.
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
            <div className="relative h-95">
              <Skeleton className="h-full !rounded-none" />
              {/* Künye çubukları koyu tonda: fotoğrafın üstünde durdukları için ton farkı bir şey söyler. */}
              <div className="absolute inset-x-5.5 bottom-4.5 flex flex-col gap-1">
                <Skeleton className="h-4 w-[44%] !bg-sand-300" />
                <Skeleton className="h-8 w-[72%] !bg-sand-300" />
              </div>
            </div>
            <div className="flex gap-4 px-5.5 py-5">
              <Skeleton className="h-14 flex-1 !rounded-control" />
              <Skeleton className="h-14 flex-1 !rounded-control" />
            </div>
            <div className="flex justify-center px-7.5">
              <Skeleton className="h-5 w-[78%]" />
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
