import type { Locale } from '@lezzet/i18n';
import { getLocale } from 'next-intl/server';
import { MessageScreenSkeleton } from '@/components/customer/ui/message-screen';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { detectDevice } from '@/lib/device';

/** Komşu daveti sunucuda okunduğu için bağlantıyı açan ziyaretçi bu kare olmadan boş sayfaya bakar; hâlin hangisi olacağı veriden gelir. */
export default async function NeighborLoading() {
  const [device, locale] = await Promise.all([detectDevice(), getLocale() as Promise<Locale>]);

  return (
    <SiteFrame device={device} locale={locale}>
      <MessageScreenSkeleton device={device} />
    </SiteFrame>
  );
}
