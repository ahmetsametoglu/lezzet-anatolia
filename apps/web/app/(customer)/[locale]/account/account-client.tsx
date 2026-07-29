'use client';

import type { Locale } from '@lezzet/i18n';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device';
import type { AccountView } from '@/lib/account/read';
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
}

export function AccountClient({ t, locale, account, device }: AccountClientProps) {
  const view = { t, locale, account };
  return useDevice(device) === 'mobile' ? <AccountMobile {...view} /> : <AccountDesktop {...view} />;
}
