'use client';

import type { Locale } from '@lezzet/i18n';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device';
import type { StorefrontProductDetail } from '@/lib/storefront/storefront-types';
import type { Messages } from './product-types';
import { ProductDesktop } from './product.desktop';
import { ProductMobile } from './product.mobile';

/**
 * Ürün detayın cihaz çatalı. Sayfanın durumu (seçili varyant, adet) `PurchasePanel`'in içinde
 * yaşar — burada state YOK; bu katman yalnız `useDevice` içindir (UA tahmini yanlışsa mount sonrası
 * düzeltilir).
 */
interface ProductClientProps {
  t: Messages;
  locale: Locale;
  product: StorefrontProductDetail;
  device: Device;
}

export function ProductClient({ t, locale, product, device }: ProductClientProps) {
  const resolved = useDevice(device);
  const view = { t, locale, product };
  return resolved === 'mobile' ? <ProductMobile {...view} /> : <ProductDesktop {...view} />;
}
