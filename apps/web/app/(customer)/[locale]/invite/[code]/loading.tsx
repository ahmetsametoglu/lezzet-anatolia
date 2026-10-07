import type { Locale } from '@lezzet/i18n';
import inviteCopy from '@lezzet/i18n/customer/invite';
import { getLocale } from 'next-intl/server';
import { LoadingState } from '@/components/customer/phone-kit/loading-state';
import { MessageScreenSkeleton } from '@/components/customer/ui/message-screen';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { detectDevice } from '@/lib/device';

/** Davet sunucuda okunduğu için bağlantıyı açan ziyaretçi bu kare olmadan boş sayfaya bakar; telefonda native'in bekleme hâli çizilir. */
export default async function InviteLoading() {
  const [device, locale] = await Promise.all([detectDevice(), getLocale() as Promise<Locale>]);
  const copy = inviteCopy[locale];

  return (
    <SiteFrame device={device} locale={locale} mobileTitle={copy.title}>
      {device === 'mobile' ? (
        <div className="flex flex-1 items-center justify-center">
          <LoadingState label={copy.loading} />
        </div>
      ) : (
        <MessageScreenSkeleton device={device} />
      )}
    </SiteFrame>
  );
}
