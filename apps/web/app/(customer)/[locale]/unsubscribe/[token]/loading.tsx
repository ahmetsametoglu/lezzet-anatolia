import type { Locale } from '@lezzet/i18n';
import { getLocale } from 'next-intl/server';
import { LoadingState } from '@/components/customer/phone-kit/loading-state';
import { MessageScreenSkeleton } from '@/components/customer/ui/message-screen';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { detectDevice } from '@/lib/device';
import messages from './messages.json';

/** Abonelik hâli sunucuda okunduğu için bağlantıyı açan bu kare olmadan boş sayfaya bakar; telefonda native'in bekleme hâli çizilir. */
export default async function UnsubscribeLoading() {
  const [device, locale] = await Promise.all([detectDevice(), getLocale() as Promise<Locale>]);
  const t = messages[locale];

  return (
    <SiteFrame device={device} locale={locale} mobileTitle={t.eyebrow}>
      {device === 'mobile' ? (
        <div className="flex flex-1 items-center justify-center">
          <LoadingState label={t.loading} />
        </div>
      ) : (
        <MessageScreenSkeleton device={device} />
      )}
    </SiteFrame>
  );
}
