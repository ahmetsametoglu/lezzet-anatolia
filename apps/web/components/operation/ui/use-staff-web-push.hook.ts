'use client';

import { useEffect } from 'react';
import { registerStaffWebPushAction, removeStaffWebPushAction } from '@/lib/push/actions';
import { useWebPush } from '@/lib/push/use-web-push.hook';
import { registerServiceWorker, syncWebPushSubscription, type WebPushSurface } from '@/lib/push/web-push-client';

const staffWebPush: WebPushSurface = {
  register: async (subscription) => (await registerStaffWebPushAction(subscription)).data === true,
  remove: async (endpoint) => (await removeStaffWebPushAction(endpoint)).data === true,
};

/** Panel her açılışta aboneliği oturumdaki personele yeniden kaydeder; müşteri sitesindeki kök kurulumun operasyon eşi. */
export function useStaffWebPush() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    registerServiceWorker()
      .then(() => syncWebPushSubscription(staffWebPush))
      .catch(() => {
        // Kayıt düşerse (kapalı ayar, ağ) panel aynen çalışır ve zil yerinde kalır; eşitleme sonraki açılışta yeniden dener.
      });
  }, []);
  return useWebPush(staffWebPush);
}
