import type { Locale } from '@lezzet/i18n';
import { getLocale } from 'next-intl/server';
import { BrandLogo } from '@/components/customer/ui/brand-logo';
import { Skeleton, SkeletonRegion, SkeletonText } from '@/components/customer/ui/skeleton';
import { detectDevice } from '@/lib/device';
import messages from './messages.json';

/**
 * Davet sunucuda açıldığı için e-postadaki bağlantıdan gelen müşteri bu kare olmadan boş sayfaya bakar. Akış karşılama adımıyla
 * başlar; açıklama sipariş ve puan taşıdığı için iskelettir, başlık gerçek.
 */
export default async function FeedbackLoading() {
  const [device, locale] = await Promise.all([detectDevice(), getLocale() as Promise<Locale>]);
  const compact = device === 'mobile';

  return (
    <div className="flex min-h-screen justify-center bg-cream px-4 py-8">
      <div className={`flex w-full flex-col items-center gap-3.5 py-6 text-center ${compact ? 'max-w-[390px]' : 'max-w-[460px]'}`}>
        <BrandLogo size="compact" alt="" />
        <p className={`font-serif ${compact ? 'text-page-title-sm' : 'text-card-title'} leading-tight text-ink`}>
          {messages[locale].welcomeTitle}
        </p>
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
