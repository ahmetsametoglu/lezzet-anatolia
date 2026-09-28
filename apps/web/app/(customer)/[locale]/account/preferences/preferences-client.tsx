'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import type { NotificationPreferencesView } from '@lezzet/application';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import { cancelZoneNoticesAction } from './actions';
import { PreferencesDesktop } from './preferences.desktop';
import { PreferencesMobile } from './preferences.mobile';
import type { Messages } from './preferences-types';

/** Bildirim tercihlerinin cihaz çatalı ve bölge haberi iptalinin sahibi. */
interface PreferencesClientProps {
  t: Messages;
  locale: Locale;
  device: Device;
  view: NotificationPreferencesView | null;
  token: string | null;
}

export function PreferencesClient({ t, locale, device, view, token }: PreferencesClientProps) {
  const resolved = useDevice(device);
  const [zoneBusy, setZoneBusy] = useState(false);
  const [zoneGone, setZoneGone] = useState(false);
  const [failed, setFailed] = useState(false);

  const cancelZone = async () => {
    setZoneBusy(true);
    setFailed(false);
    const { errorKey } = await cancelZoneNoticesAction(token);
    setZoneBusy(false);
    if (errorKey) setFailed(true);
    else setZoneGone(true);
  };

  const props = {
    t,
    locale,
    view,
    token,
    // Sunucu tazelenmesi bir tur sürüyor; iptal edilen kayıtları o tura kadar yerelde düşürüyoruz.
    zoneNotices: zoneGone ? [] : (view?.zoneNotices ?? []),
    zoneBusy,
    failed,
    onCancelZone: () => void cancelZone(),
  };
  return resolved === 'mobile' ? <PreferencesMobile {...props} /> : <PreferencesDesktop {...props} />;
}
