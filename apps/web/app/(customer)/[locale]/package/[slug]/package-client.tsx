'use client';

import type { Locale } from '@lezzet/i18n';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import type { StorefrontPackageDetail } from '@/lib/storefront/storefront-types';
import type { Messages } from './package-types';
import { PackageDesktop } from './package.desktop';
import { PackageMobile } from './package.mobile';

/**
 * Paket detayın cihaz çatalı (Sapma 3).
 *
 * Ürün detayının aksine burada PAYLAŞILAN DURUM YOK: pakette seçilecek boy yoktur, adet de yalnız
 * satın alma kutusunu ilgilendirir (fiyat, künye ve içerik ondan etkilenmez). Bu yüzden çatal sade
 * kalır — durum, ona ihtiyacı olan tek bileşenin içinde yaşar.
 */
interface PackageClientProps {
  t: Messages;
  locale: Locale;
  pack: StorefrontPackageDetail;
  device: Device;
}

export function PackageClient({ t, locale, pack, device }: PackageClientProps) {
  const view = { t, locale, pack };
  return useDevice(device) === 'mobile' ? <PackageMobile {...view} /> : <PackageDesktop {...view} />;
}
