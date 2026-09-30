import catalogMessages from '@lezzet/i18n/customer/catalog';
import type { Locale } from '@lezzet/i18n';
import { getLocale } from 'next-intl/server';
import { PhoneSkeleton } from '@/components/customer/phone-kit/phone-skeleton';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { Skeleton, SkeletonBlock, SkeletonRegion } from '@/components/customer/ui/skeleton';
import { detectDevice } from '@/lib/device';
import { CatalogPhoneSkeleton } from './components/catalog-phone-skeleton';

/**
 * Katalog sunucuda okunduğu için bu kare olmadan ekran veri gelene kadar önceki sayfada kalır. Başlığın kategorileri veriden
 * geldiği için başlık da iskelettir; telefonda ızgara süzgeç geçişinin iskeletiyle aynı.
 */
export default async function CatalogLoading() {
  const [device, locale] = await Promise.all([detectDevice(), getLocale() as Promise<Locale>]);

  return (
    <SiteFrame device={device} locale={locale} activeNav="catalog">
      {device === 'mobile' ? (
        <div className="flex flex-col">
          <div className="sticky top-0 z-20 flex flex-col gap-2.5 border-b-[1.5px] border-ink bg-sand-50 pt-2 pb-2.5">
            <div className="flex items-center gap-2.5 px-4.5">
              <PhoneSkeleton radius="control" className="h-11.5 min-w-0 flex-1" />
              <PhoneSkeleton className="size-11.5 flex-none" />
            </div>
            <div className="flex gap-2 overflow-hidden px-4.5">
              {CHIP_WIDTHS.map((width) => (
                <PhoneSkeleton key={width} radius="control" className={`h-10 flex-none ${width}`} />
              ))}
            </div>
          </div>
          <CatalogPhoneSkeleton label={catalogMessages[locale].loading} />
        </div>
      ) : (
        <SkeletonRegion>
          <div className="flex flex-col gap-5 px-12 pt-9 pb-5">
            <Skeleton className="h-11 w-72" />
            <div className="flex flex-wrap gap-2.5">
              {CHIP_WIDTHS.map((width) => (
                <Skeleton key={width} className={`h-10 !rounded-pill ${width}`} />
              ))}
            </div>
            <div className="flex h-9 items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-9 w-80 !rounded-pill" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-[18px] px-12 pt-1 pb-12">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((slot) => (
              <div key={slot} className="flex flex-col gap-3">
                <SkeletonBlock className="aspect-square !rounded-card" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            ))}
          </div>
        </SkeletonRegion>
      )}
    </SiteFrame>
  );
}

/** Çiplerin boyu kategori adından gelir; eşit genişlikte çubuklar ray gibi değil tablo gibi okunur. */
const CHIP_WIDTHS = ['w-[72px]', 'w-24', 'w-20', 'w-28', 'w-[88px]'];
