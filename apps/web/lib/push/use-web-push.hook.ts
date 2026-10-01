'use client';

import { useCallback, useEffect, useState } from 'react';
import { currentWebPushSubscription, subscribeWebPush, webPushSupported, type WebPushSurface } from './web-push-client';

/** `denied`: tarayıcı bu sitenin bildirimini engellemiş; anahtar yeniden istem açamaz, yol yalnız tarayıcı ayarıdır. */
export type WebPushMode = 'hidden' | 'denied' | 'ready';

interface WebPushState {
  mode: WebPushMode;
  on: boolean;
}

/** Sunucu karesinde ve desteklemeyen tarayıcıda anahtar çizilmez; `errorKey` doluysa yüzey kendi başarısızlık cümlesini gösterir. */
export function useWebPush(surface: WebPushSurface): WebPushState & { toggle: (next: boolean) => Promise<{ errorKey: string | null }> } {
  const [state, setState] = useState<WebPushState>({ mode: 'hidden', on: false });

  useEffect(() => {
    if (!webPushSupported()) return;
    let alive = true;
    void currentWebPushSubscription().then((subscription) => {
      if (!alive) return;
      const permission = Notification.permission;
      setState({ mode: permission === 'denied' ? 'denied' : 'ready', on: subscription !== null && permission === 'granted' });
    });
    return () => {
      alive = false;
    };
  }, []);

  const toggle = useCallback(
    async (next: boolean): Promise<{ errorKey: string | null }> => {
      try {
        if (next) {
          const subscription = await subscribeWebPush();
          if (!subscription) {
            if (Notification.permission === 'denied') setState({ mode: 'denied', on: false });
            return { errorKey: 'permission' };
          }
          if (!(await surface.register(subscription.toJSON()))) return { errorKey: 'unexpected' };
          setState({ mode: 'ready', on: true });
          return { errorKey: null };
        }

        // Önce sunucu silinir: tarayıcıdaki abonelik düşmese bile o adrese bir daha gönderilmez.
        const subscription = await currentWebPushSubscription();
        if (subscription) {
          if (!(await surface.remove(subscription.endpoint))) return { errorKey: 'unexpected' };
          await subscription.unsubscribe();
        }
        setState({ mode: 'ready', on: false });
        return { errorKey: null };
      } catch {
        // Tarayıcı aboneliği reddederse (bildirim servisine ulaşılamadı) anahtar eski hâline döner ve yüzey notunu gösterir.
        return { errorKey: 'unexpected' };
      }
    },
    [surface],
  );

  return { ...state, toggle };
}
