'use client';

import type { Locale } from '@lezzet/i18n';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import type { AccountView } from '@/lib/account/read';
import type { ChatLinkNotice } from '@/lib/identity/cart-link-landing';
import type { Messages } from './account-types';
import { AccountDesktop } from './account.desktop';
import { AccountMobile } from './account.mobile';

/**
 * Hesap sayfasının cihaz çatalı (Sapma 3). Durum yok: sayfa okuduğunu gösterir, değiştirmez —
 * düzenleme akışları kendi bileşenlerinde doğacak.
 */
interface AccountClientProps {
  t: Messages;
  locale: Locale;
  account: AccountView;
  device: Device;
  chatNotice: ChatLinkNotice | null;
}

export function AccountClient({ t, locale, account, device, chatNotice }: AccountClientProps) {
  const view = { t, locale, account, chatNotice };
  return useDevice(device) === 'mobile' ? <AccountMobile {...view} /> : <AccountDesktop {...view} />;
}
