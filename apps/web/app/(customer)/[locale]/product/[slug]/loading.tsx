import productMessages from '@lezzet/i18n/customer/product';
import type { Locale } from '@lezzet/i18n';
import { getLocale } from 'next-intl/server';
import { PhoneSkeleton } from '@/components/customer/phone-kit/phone-skeleton';
import { StickyBar } from '@/components/customer/phone-kit/sticky-bar';
import { BackButton } from '@/components/customer/ui/back-button';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { Skeleton, SkeletonBlock, SkeletonCard, SkeletonRegion, SkeletonText } from '@/components/customer/ui/skeleton';
import { detectDevice } from '@/lib/device';

/**
 * Ürün sunucuda okunduğu için bu kare olmadan ekran veri gelene kadar önceki sayfada kalır. Telefonda bölümler native iskeletin
 * sırası; geri düğmesi gerçek, çünkü müşteri yükleme sürerken de vazgeçebilmeli.
 */
export default async function ProductLoading() {
  const [device, locale] = await Promise.all([detectDevice(), getLocale() as Promise<Locale>]);

  return (
    <SiteFrame device={device} locale={locale} activeNav="catalog">
      {device === 'mobile' ? (
        <div className="flex min-h-dvh flex-col bg-cream">
          <div className="relative h-[400px] flex-none">
            <PhoneSkeleton radius="none" className="absolute inset-0" />
            <div className="absolute inset-x-4 top-[calc(env(safe-area-inset-top)+8px)] flex justify-between">
              <BackButton variant="photo" label={productMessages[locale].back} fallback="/catalog" />
              <PhoneSkeleton tone="deep" className="size-10.5" />
            </div>
          </div>
          <SkeletonRegion>
            <div className="flex flex-col gap-2 px-3.5 pt-3.5 pb-1.5">
              <PhoneSkeleton className="h-8 w-[72%]" />
              <PhoneSkeleton className="h-3.5 w-[48%]" />
            </div>
            <div className="mx-3 my-1 border-y-[1.5px] border-ink">
              {[0, 1, 2].map((slot) => (
                <div key={slot} className={['p-2.5', slot === 0 ? '' : 'border-t-[1.5px] border-dashed border-sand-400'].join(' ')}>
                  <PhoneSkeleton className="h-4 w-[46%]" />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2 px-3 pt-2.5">
              <PhoneSkeleton className="h-5 w-[52%]" />
              <PhoneSkeleton radius="card" className="h-[70px] w-full" />
            </div>
          </SkeletonRegion>
          <div aria-hidden className="h-27 flex-none" />
          <StickyBar>
            <div className="flex items-center gap-2.5">
              <PhoneSkeleton radius="control" className="h-13 w-28 flex-none" />
              <PhoneSkeleton radius="control" className="h-13 min-w-0 flex-1" />
            </div>
          </StickyBar>
        </div>
      ) : (
        <SkeletonRegion>
          <div className="px-12 pt-5">
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="grid grid-cols-[1fr_470px] items-start gap-11 px-12 pt-8 pb-9.5">
            <div className="flex flex-col gap-3.5">
              <SkeletonBlock className="aspect-square !rounded-card" />
              <div className="flex gap-3">
                {[0, 1, 2, 3].map((slot) => (
                  <SkeletonBlock key={slot} className="size-20 !rounded-soft" />
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-11 w-4/5" />
              <Skeleton className="h-5 w-48" />
              <SkeletonText lines={3} />
              <div className="flex gap-2.5">
                <Skeleton className="h-14 w-32 !rounded-soft" />
                <Skeleton className="h-14 w-32 !rounded-soft" />
              </div>
              <SkeletonCard>
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-12 w-full !rounded-pill" />
              </SkeletonCard>
            </div>
          </div>
        </SkeletonRegion>
      )}
    </SiteFrame>
  );
}
