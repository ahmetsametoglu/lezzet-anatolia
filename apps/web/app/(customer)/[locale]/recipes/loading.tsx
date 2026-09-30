import recipesMessages from '@lezzet/i18n/customer/recipes';
import type { Locale } from '@lezzet/i18n';
import { getLocale } from 'next-intl/server';
import { PhoneSkeleton } from '@/components/customer/phone-kit/phone-skeleton';
import { BackButton } from '@/components/customer/ui/back-button';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { Skeleton, SkeletonBlock, SkeletonRegion } from '@/components/customer/ui/skeleton';
import { detectDevice } from '@/lib/device';
import messages from './messages.json';

/**
 * Tarif listesi sunucuda okunduğu için bu kare olmadan ekran veri gelene kadar önceki sayfada kalır. Başlık metni veriden
 * bağımsız olduğu için gerçek çizilir; telefonda kart boyu native iskeletininki.
 */
export default async function RecipesLoading() {
  const [device, locale] = await Promise.all([detectDevice(), getLocale() as Promise<Locale>]);

  if (device === 'mobile') {
    const copy = recipesMessages[locale];
    return (
      <SiteFrame device={device} locale={locale} activeNav="recipes">
        <div className="flex flex-col gap-3 px-4.5 pt-2.5 pb-5">
          <div className="flex flex-col gap-2 pt-1.5">
            <div className="-ml-2 flex items-center gap-2">
              <BackButton label={copy.back} fallback="/" />
              <p className="min-w-0 flex-1 font-serif text-screen-title text-ink">{copy.title}</p>
            </div>
            <p className="font-sans text-note leading-[1.6] text-muted">{copy.body}</p>
          </div>
          <SkeletonRegion>
            <div className="flex flex-col gap-3">
              {[0, 1, 2, 3].map((slot) => (
                <PhoneSkeleton key={slot} radius="card" className="h-42 w-full" />
              ))}
            </div>
          </SkeletonRegion>
        </div>
      </SiteFrame>
    );
  }

  const t = messages[locale];
  return (
    <SiteFrame device={device} locale={locale} activeNav="recipes">
      <div className="flex flex-col">
        <div className="flex max-w-[860px] flex-col gap-3.5 px-12 pt-11 pb-2.5">
          <span className="font-sans text-eyebrow text-olive uppercase">{t.eyebrow}</span>
          <p className="font-serif text-page-title text-ink">{t.heroTitle}</p>
          <p className="font-sans text-lead text-body">{t.heroBody}</p>
        </div>
        <SkeletonRegion>
          <div className="grid grid-cols-3 gap-4.5 px-12 pt-6.5 pb-11">
            {[0, 1, 2].map((slot) => (
              <div key={slot} className="flex flex-col gap-3">
                <SkeletonBlock className="aspect-[3/2] !rounded-card" />
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-3.5 w-1/3" />
              </div>
            ))}
          </div>
        </SkeletonRegion>
      </div>
    </SiteFrame>
  );
}
