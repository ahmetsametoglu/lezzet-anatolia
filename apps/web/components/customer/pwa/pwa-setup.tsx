'use client';

import { useEffect } from 'react';
import { captureInstallPrompt } from './install-prompt';

/**
 * Kökte durur, çünkü kurulum sinyali belge açılışında bir kez gelir. `updateViaCache: 'none'`: tarayıcı `sw.js`'in yenisini her
 * açılışta sunucuya sorar, önbellekteki eski dosya güncellemeyi bekletmez.
 */
export function PwaSetup() {
  useEffect(() => {
    const release = captureInstallPrompt();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
        // Tarayıcı kaydı reddederse (gizli pencere, kapalı ayar) site aynen çalışır; yalnız kurulum düğmesi çıkmaz.
      });
    }
    return release;
  }, []);
  return null;
}
