import packageDetailMessages from '@lezzet/i18n/customer/package-detail';
import type { Locale } from '@lezzet/i18n';
import { getLocale } from 'next-intl/server';
import { PhoneSkeleton } from '@/components/customer/phone-kit/phone-skeleton';
import { StickyBar } from '@/components/customer/phone-kit/sticky-bar';
import { BackButton } from '@/components/customer/ui/back-button';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { Skeleton, SkeletonBlock, SkeletonCard, SkeletonRegion, SkeletonText } from '@/components/customer/ui/skeleton';
import { detectDevice } from '@/lib/device';

/**
 * Paket sunucuda okunduğu için bu kare olmadan ekran veri gelene kadar önceki sayfada kalır. Telefonda başlık çubuğu ve içerik
 * başlığı veriden bağımsız olduğu için gerçek çizilir; bölümler native iskeletin sırası.
 */
export default async function PackageLoading() {
  const [device, locale] = await Promise.all([detectDevice(), getLocale() as Promise<Locale>]);
  const copy = packageDetailMessages[locale];

  return (
    <SiteFrame device={device} locale={locale} activeNav="packages">
      {device === 'mobile' ? (
        <div className="flex min-h-dvh flex-col bg-cream">
          <div className="sticky top-0 z-20 flex items-center gap-2.5 border-b-[1.5px] border-ink bg-sand-50/96 px-3.5 py-2 backdrop-blur-sm">
            <BackButton label={copy.back} fallback="/packages" />
            <span className="min-w-0 flex-1 truncate font-serif text-screen-title text-ink">{copy.header}</span>
            <PhoneSkeleton className="size-10 flex-none" />
          </div>
          <SkeletonRegion>
            {/* Galeri 3:2 çizer ve kabın 16:10'unu aşar; iskelet ekranda görünen yüksekliği tutar. */}
            <PhoneSkeleton radius="none" className="aspect-[3/2] w-full" />
            <div className="flex flex-col gap-2.5 px-4.5 py-4">
              <PhoneSkeleton className="h-8 w-[74%]" />
              <PhoneSkeleton className="h-6 w-[42%]" />
              <p className="mt-1.5 font-serif text-screen-title text-ink">{copy.contents.title}</p>
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map((slot) => (
                  <PhoneSkeleton key={slot} radius="card" className="h-[66px] w-full" />
                ))}
              </div>
              <PhoneSkeleton className="h-3.5 w-[88%]" />
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
            <Skeleton className="h-4 w-56" />
          </div>
          <div className="grid grid-cols-[1.1fr_1fr] items-start gap-12 px-12 pt-6 pb-10">
            <SkeletonBlock className="aspect-[3/2] !rounded-card" />
            <div className="flex flex-col gap-4">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-11 w-4/5" />
              <Skeleton className="h-6 w-40" />
              <SkeletonText lines={3} />
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
