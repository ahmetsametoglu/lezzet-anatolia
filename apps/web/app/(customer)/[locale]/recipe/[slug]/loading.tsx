import recipeDetailMessages from '@lezzet/i18n/customer/recipe-detail';
import type { Locale } from '@lezzet/i18n';
import { getLocale } from 'next-intl/server';
import { PhoneSkeleton } from '@/components/customer/phone-kit/phone-skeleton';
import { BackButton } from '@/components/customer/ui/back-button';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { Skeleton, SkeletonBlock, SkeletonRegion, SkeletonText } from '@/components/customer/ui/skeleton';
import { detectDevice } from '@/lib/device';
import messages from './messages.json';

/**
 * Tarif sunucuda okunduğu için bu kare olmadan ekran veri gelene kadar önceki sayfada kalır. Bölüm başlıkları veriden bağımsız
 * olduğu için gerçek çizilir; telefonda bölümler native iskeletin sırası ve geri düğmesi gerçek.
 */
export default async function RecipeLoading() {
  const [device, locale] = await Promise.all([detectDevice(), getLocale() as Promise<Locale>]);

  if (device === 'mobile') {
    const copy = recipeDetailMessages[locale];
    return (
      <SiteFrame device={device} locale={locale} activeNav="recipes">
        <div className="flex min-h-dvh flex-col bg-cream">
          <div className="relative h-75 flex-none">
            <PhoneSkeleton radius="none" className="absolute inset-0" />
            <div className="absolute top-[calc(env(safe-area-inset-top)+8px)] left-4">
              <BackButton variant="photo" label={copy.back} fallback="/recipes" />
            </div>
          </div>
          <SkeletonRegion>
            <div className="flex flex-col gap-2.5 px-5.5 pt-5 pb-2">
              <span className="font-sans text-eyebrow-xs text-terracotta">{copy.eyebrow}</span>
              <PhoneSkeleton className="h-8 w-[76%]" />
              <p className="mt-2 font-sans text-eyebrow-xs text-terracotta">{copy.sections.ours}</p>
              <div className="flex flex-col">
                {[0, 1, 2].map((slot) => (
                  <div key={slot} className="flex items-center gap-3 border-b-[1.5px] border-dashed border-sand-400 py-2.5">
                    <PhoneSkeleton className="size-11.5 flex-none" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <PhoneSkeleton className="h-4 w-[64%]" />
                      <PhoneSkeleton className="h-3 w-[38%]" />
                    </div>
                    <PhoneSkeleton radius="control" className="size-9.5 flex-none" />
                  </div>
                ))}
              </div>
              <p className="mt-2 font-sans text-eyebrow-xs text-terracotta">{copy.sections.steps}</p>
              <div className="flex flex-col gap-3">
                {[0, 1].map((slot) => (
                  <div key={slot} className="flex gap-3">
                    <PhoneSkeleton className="size-7 flex-none" />
                    <PhoneSkeleton radius="control" className="h-14 min-w-0 flex-1" />
                  </div>
                ))}
              </div>
            </div>
          </SkeletonRegion>
        </div>
      </SiteFrame>
    );
  }

  const t = messages[locale];
  return (
    <SiteFrame device={device} locale={locale} activeNav="recipes">
      <SkeletonRegion>
        <div className="flex flex-col gap-6 px-12 pt-5 pb-11">
          <Skeleton className="h-4 w-56" />
          <div className="flex flex-col gap-1">
            <span className="font-sans text-eyebrow-sm text-olive uppercase">{t.eyebrow}</span>
            <Skeleton className="h-9 w-96" />
          </div>
          <div className="grid grid-cols-[1.1fr_1fr] items-start gap-9">
            <SkeletonBlock className="aspect-[3/2] !rounded-card" />
            <div className="flex flex-col gap-3.5">
              {[0, 1, 2, 3].map((slot) => (
                <Skeleton key={slot} className="h-14 w-full !rounded-soft" />
              ))}
              <SkeletonText lines={3} />
            </div>
          </div>
        </div>
      </SkeletonRegion>
    </SiteFrame>
  );
}
