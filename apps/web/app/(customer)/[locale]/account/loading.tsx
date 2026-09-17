import type { Locale } from '@lezzet/i18n';
import { getLocale } from 'next-intl/server';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { Skeleton, SkeletonRegion } from '@/components/customer/ui/skeleton';
import { detectDevice } from '@/lib/device';

/**
 * Hesap sunucuda okunduğu için bu kare olmadan ekran veri gelene kadar önceki sayfada kalır. Çerçeve başlıksız çizilir ve başlık
 * da iskelettir, çünkü bu kare kendi yükleme karesi olmayan alt sayfalarda da görünür; ölçüler native iskeletininki.
 */
export default async function AccountLoading() {
  const [device, locale] = await Promise.all([detectDevice(), getLocale() as Promise<Locale>]);

  return (
    <SiteFrame device={device} locale={locale} accountChrome={{ nav: 'account', title: '' }}>
      <SkeletonRegion>
        <div className={device === 'mobile' ? 'flex flex-col gap-3.5 px-4.5' : 'mx-auto flex w-full max-w-5xl flex-col gap-5 px-12 pt-8'}>
          <Skeleton className="h-8 w-[42%]" />
          <Skeleton className="h-22 w-full !rounded-card" />
        </div>
      </SkeletonRegion>
    </SiteFrame>
  );
}
