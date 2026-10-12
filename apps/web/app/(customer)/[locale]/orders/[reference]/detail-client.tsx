'use client';

import type { Locale } from '@lezzet/i18n';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import type { CustomerOrderDetail } from '@/lib/order/customer-orders';
import type { Messages as ListMessages } from '../orders-types';
import type { DetailViewProps, Messages } from './detail-types';
import { DetailDesktop } from './detail.desktop';
import { DetailMobile } from './detail.mobile';

/**
 * Detay sayfasının cihaz çatalı; durum tutmaz, sayfa okuduğunu gösterir. Tekrar sipariş düğmesi kendi durumunu taşır, çünkü
 * masaüstünde sunucuda çizilen başlığın içinde, telefonda sayfanın altında durur.
 */
interface DetailClientProps {
  t: Messages;
  listT: ListMessages;
  locale: Locale;
  order: CustomerOrderDetail;
  device: Device;
  /** Açık yorum daveti — sunucuda okundu, iki fork da aynı bloğu çiziyor (künye `FeedbackInviteCard`). */
  feedbackInvite: DetailViewProps['feedbackInvite'];
}

export function DetailClient({ t, listT, locale, order, device, feedbackInvite }: DetailClientProps) {
  const view = { t, listT, locale, order, feedbackInvite };
  return useDevice(device) === 'mobile' ? <DetailMobile {...view} /> : <DetailDesktop {...view} />;
}
