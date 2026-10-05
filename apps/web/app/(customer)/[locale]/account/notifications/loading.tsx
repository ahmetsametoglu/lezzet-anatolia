import type { Locale } from '@lezzet/i18n';
import notificationsMessages from '@lezzet/i18n/customer/notifications';
import { getLocale } from 'next-intl/server';
import { PhoneSkeleton } from '@/components/customer/phone-kit/phone-skeleton';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { Skeleton, SkeletonRegion } from '@/components/customer/ui/skeleton';
import { detectDevice } from '@/lib/device';
import messages from './messages.json';

/**
 * Akışın ilk sayfası sunucuda okunduğu için bu kare olmadan ekran veri gelene kadar önceki sayfada kalır. Satır, gelen satırın
 * yerini tutar (ikon dairesi, etiket, cümle); çerçeve sayfanınkiyle aynı ki başlık bekleme boyunca yerinde dursun.
 */
export default async function NotificationsLoading() {
  const [device, locale] = await Promise.all([detectDevice(), getLocale() as Promise<Locale>]);
  const t = messages[locale];

  return (
    <SiteFrame device={device} locale={locale} accountChrome={{ back: { label: t.back, href: '/account' }, title: notificationsMessages[locale].title }}>
      <SkeletonRegion>
        {device === 'mobile' ? (
          <div className="flex flex-col gap-2.5 px-4.5 py-3.5">
            {[0, 1, 2, 3, 4].map((slot) => (
              <div key={slot} className="flex items-start gap-3 rounded-card bg-sand-250 py-3.25 pr-1.5 pl-3.75">
                <PhoneSkeleton tone="deep" className="size-10 flex-none" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1">
                  <PhoneSkeleton tone="deep" className="h-3.5 w-[40%]" />
                  <PhoneSkeleton tone="deep" className={['h-3', slot % 2 === 0 ? 'w-4/5' : 'w-3/5'].join(' ')} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6">
            <div className="flex flex-col divide-y divide-sand-100 rounded-card border border-sand-200 bg-card px-4">
              {[0, 1, 2, 3, 4, 5].map((slot) => (
                <div key={slot} className="flex items-start gap-2.5 py-3">
                  <Skeleton className="h-9 w-9 flex-none !rounded-full" />
                  <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
                    <Skeleton className="h-2.5 w-24" />
                    <Skeleton className={['h-3.5', slot % 2 === 0 ? 'w-4/5' : 'w-3/5'].join(' ')} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </SkeletonRegion>
    </SiteFrame>
  );
}
