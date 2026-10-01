'use client';

import { useEffect } from 'react';
import { registerServiceWorker, syncWebPushSubscription } from '@/lib/push/web-push-client';
import { customerWebPush } from './customer-web-push';
import { captureInstallPrompt } from './install-prompt';

/** Kökte durur, çünkü kurulum sinyali belge açılışında bir kez gelir. */
export function PwaSetup() {
  useEffect(() => {
    const release = captureInstallPrompt();
    if ('serviceWorker' in navigator) {
      registerServiceWorker()
        .then(() => syncWebPushSubscription(customerWebPush))
        .catch(() => {
          // Kayıt ya da eşitleme düşerse (gizli pencere, kapalı ayar, ağ) site aynen çalışır; eşitleme sonraki açılışta yeniden dener.
        });
    }
    return release;
  }, []);
  return null;
}
