'use client';

import { useEffect } from 'react';

/** `updateViaCache: 'none'`: tarayıcı `sw.js`'in yenisini her açılışta sunucuya sorar, önbellekteki eski dosya güncellemeyi bekletmez. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
      // Tarayıcı kaydı reddederse (gizli pencere, kapalı ayar) site aynen çalışır; yalnız kurulum düğmesi çıkmaz.
    });
  }, []);
  return null;
}
