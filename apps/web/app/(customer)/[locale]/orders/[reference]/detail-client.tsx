'use client';

import type { Locale } from '@lezzet/i18n';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device';
import type { CustomerOrderDetail } from '@/lib/order/customer-orders';
import type { Messages as ListMessages } from '../orders-types';
import type { Messages } from './detail-types';
import { DetailDesktop } from './detail.desktop';
import { DetailMobile } from './detail.mobile';

/**
 * Detay sayfasının cihaz çatalı (Sapma 3). **Durum yok:** sayfa okuduğunu gösteriyor.
 *
 * Tekrar sipariş burada DEĞİL — tasarımda o düğme masaüstünde başlığın içinde, mobilde sayfanın
 * altında. İki ayrı yerde duran bir aksiyonun durumunu tek bir sayfa bileşeninde tutmak, başlığın
 * sunucuda çizilmesi yüzünden zaten mümkün değildi; düğme kendi durumunu taşıyor
 * (`components/reorder-button.tsx`).
 */
interface DetailClientProps {
  t: Messages;
  listT: ListMessages;
  locale: Locale;
  order: CustomerOrderDetail;
  device: Device;
}

export function DetailClient({ t, listT, locale, order, device }: DetailClientProps) {
  const view = { t, listT, locale, order };
  return useDevice(device) === 'mobile' ? <DetailMobile {...view} /> : <DetailDesktop {...view} />;
}
