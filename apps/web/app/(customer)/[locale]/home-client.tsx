'use client';

import type { Locale } from '@lezzet/i18n';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import type { StorefrontHome } from '@/lib/storefront/storefront-types';
import type { Messages } from './home-types';
import { HomeDesktop } from './home.desktop';
import { HomeMobile } from './home.mobile';

/**
 * Anasayfanın cihaz çatalı. Sayfa durumsuz olduğu için bu katman yalnız `useDevice` içindir:
 * sunucu ipucu (UA) yanlışsa mount sonrası düzeltilir — kullanıcı tabletten girdiğinde masaüstü
 * düzenini görür. Veri sunucuda çözülmüştür, buraya hazır iner.
 */
interface HomeClientProps {
  t: Messages;
  locale: Locale;
  data: StorefrontHome;
  device: Device;
}

export function HomeClient({ t, locale, data, device }: HomeClientProps) {
  const resolved = useDevice(device);
  const view = { t, locale, data };
  return resolved === 'mobile' ? <HomeMobile {...view} /> : <HomeDesktop {...view} />;
}
