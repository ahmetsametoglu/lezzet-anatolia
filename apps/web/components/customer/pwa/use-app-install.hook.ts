'use client';

import { useSyncExternalStore } from 'react';
import { canPromptInstall, promptInstall, subscribeInstallPrompt } from './install-prompt';
import { installModeOf, type InstallMode } from './install-mode';

interface Device {
  standalone: boolean;
  ios: boolean;
}

let device: Device | undefined;

/** iPad masaüstü sitesi ister ve Mac gibi görünür; dokunmatik ekran onu Mac'ten ayırır. */
function deviceOf(): Device {
  device ??= {
    standalone: window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true,
    ios: /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1),
  };
  return device;
}

const noopSubscribe = () => () => undefined;

/** Sunucu karesinde kart çizilmez: kurulum yolu yalnız tarayıcıda bilinir. */
export function useAppInstall(): { mode: InstallMode; install: () => Promise<void> } {
  const current = useSyncExternalStore(noopSubscribe, deviceOf, () => null);
  const canPrompt = useSyncExternalStore(subscribeInstallPrompt, canPromptInstall, () => false);
  return { mode: current ? installModeOf(current, canPrompt) : 'hidden', install: promptInstall };
}
