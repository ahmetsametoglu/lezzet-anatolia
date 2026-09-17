import type { Locale } from '@lezzet/i18n';
import { getLocale } from 'next-intl/server';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { Skeleton, SkeletonRegion } from '@/components/customer/ui/skeleton';
import { detectDevice } from '@/lib/device';
import messages from './messages.json';

/**
 * Puan geçmişi sunucuda okunduğu için bu kare olmadan ekran veri gelene kadar önceki sayfada kalır. Çerçeve gerçek başlığıyla
 * çizilir ve satırlar native iskeletinin ölçüsündedir, böylece veri gelince yerleşim kaymaz.
 */
export default async function PointsLoading() {
  const [device, locale] = await Promise.all([detectDevice(), getLocale() as Promise<Locale>]);
  const t = messages[locale];

  return (
    <SiteFrame device={device} locale={locale} accountChrome={{ back: { label: t.back, href: '/account' }, title: t.title }}>
      <SkeletonRegion>
        <div className={device === 'mobile' ? 'flex flex-col px-4.5' : 'mx-auto flex w-full max-w-2xl flex-col px-6 py-6'}>
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="flex items-center justify-between gap-3 border-b border-sand-300 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="h-3 w-[35%]" />
              </div>
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
        </div>
      </SkeletonRegion>
    </SiteFrame>
  );
}
