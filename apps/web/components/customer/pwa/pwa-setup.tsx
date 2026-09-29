'use client';

import { useEffect } from 'react';
import { captureInstallPrompt } from './install-prompt';
import { syncWebPushSubscription } from './web-push';

/**
 * Kökte durur, çünkü kurulum sinyali belge açılışında bir kez gelir. `updateViaCache: 'none'`: tarayıcı `sw.js`'in yenisini her
 * açılışta sunucuya sorar, önbellekteki eski dosya güncellemeyi bekletmez.
 */
export function PwaSetup() {
  useEffect(() => {
    const release = captureInstallPrompt();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then(syncWebPushSubscription)
        .catch(() => {
          // Kayıt ya da eşitleme düşerse (gizli pencere, kapalı ayar, ağ) site aynen çalışır; eşitleme sonraki açılışta yeniden dener.
        });
    }
    return release;
  }, []);
  return null;
}
