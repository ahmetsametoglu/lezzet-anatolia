'use client';

import type { Locale } from '@lezzet/i18n';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device';
import { CartDesktop } from './cart.desktop';
import { CartMobile } from './cart.mobile';
import type { Messages } from './cart-types';

/**
 * Sepetin cihaz çatalı. Sepet durumu burada DEĞİL kökte (`CartProvider`) — başlıktaki sayaç ve bu
 * sayfa aynı durumu görmeli, ikisi ayrı state tutarsa ekle-çıkar sonrası ayrışırlar.
 */
interface CartClientProps {
  t: Messages;
  locale: Locale;
  device: Device;
}

export function CartClient({ t, locale, device }: CartClientProps) {
  const resolved = useDevice(device);
  const view = { t, locale };
  return resolved === 'mobile' ? <CartMobile {...view} /> : <CartDesktop {...view} />;
}
