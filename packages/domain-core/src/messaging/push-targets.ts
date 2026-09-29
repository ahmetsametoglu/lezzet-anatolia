import type { PushDevice, WebPushSubscription } from '@lezzet/types';

/** Native uygulama bu kadar gündür açılmadıysa etkin sayılmaz; uygulama her gün açılışta kaydını tazeler. */
export const NATIVE_PUSH_ACTIVE_DAYS = 30;

export interface PushTargets {
  /** Expo jetonları. */
  native: string[];
  web: WebPushSubscription[];
}

/**
 * Bir haber tek cihaz sınıfına gider: etkin native uygulama varsa ona, yoksa tarayıcı aboneliklerine. İkisine birden gitseydi aynı
 * haber telefonda hem uygulamadan hem tarayıcıdan çalardı.
 */
export function choosePushTargets(
  devices: readonly Pick<PushDevice, 'platform' | 'token' | 'p256dh' | 'auth' | 'lastSeenAt'>[],
  now: Date,
  activeDays: number = NATIVE_PUSH_ACTIVE_DAYS,
): PushTargets {
  const activeSince = now.getTime() - activeDays * 24 * 60 * 60 * 1000;
  const native = devices
    .filter((device) => device.platform !== 'web' && Date.parse(device.lastSeenAt) >= activeSince)
    .map((device) => device.token);
  if (native.length > 0) return { native, web: [] };

  const web = devices.flatMap((device) =>
    device.platform === 'web' && device.p256dh !== null && device.auth !== null
      ? [{ endpoint: device.token, keys: { p256dh: device.p256dh, auth: device.auth } }]
      : [],
  );
  return { native: [], web };
}
