'use client';

import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device';
import { CartDesktop } from './cart.desktop';
import { CartMobile } from './cart.mobile';
import type { CartViewProps } from './cart-types';

/**
 * Sepetin cihaz çatalı. Sepet durumu burada DEĞİL kökte (`CartProvider`) — başlıktaki sayaç ve bu
 * sayfa aynı durumu görmeli, ikisi ayrı state tutarsa ekle-çıkar sonrası ayrışırlar.
 */
interface CartClientProps extends CartViewProps {
  device: Device;
}

export function CartClient({ device, ...view }: CartClientProps) {
  const resolved = useDevice(device);
  return resolved === 'mobile' ? <CartMobile {...view} /> : <CartDesktop {...view} />;
}
