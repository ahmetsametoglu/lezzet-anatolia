'use client';

import { useCallback, useEffect, useState } from 'react';
import { registerWebPushAction, removeWebPushAction } from '@/lib/push/actions';
import { currentWebPushSubscription, subscribeWebPush, webPushSupported } from './web-push';

/** `denied`: tarayıcı bu sitenin bildirimini engellemiş; anahtar yeniden istem açamaz, yol yalnız tarayıcı ayarıdır. */
export type WebPushMode = 'hidden' | 'denied' | 'ready';

interface WebPushState {
  mode: WebPushMode;
  on: boolean;
}

/** Sunucu karesinde ve desteklemeyen tarayıcıda kart çizilmez. */
export function useWebPush(): WebPushState & { toggle: (next: boolean) => Promise<{ errorKey: string | null }> } {
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

  const toggle = useCallback(async (next: boolean): Promise<{ errorKey: string | null }> => {
    try {
      if (next) {
        const subscription = await subscribeWebPush();
        if (!subscription) {
          if (Notification.permission === 'denied') setState({ mode: 'denied', on: false });
          return { errorKey: 'permission' };
        }
        const result = await registerWebPushAction(subscription.toJSON());
        if (result.data !== true) return { errorKey: result.errorKey ?? 'session_expired' };
        setState({ mode: 'ready', on: true });
        return { errorKey: null };
      }

      // Önce sunucu silinir: tarayıcıdaki abonelik düşmese bile o adrese bir daha gönderilmez.
      const subscription = await currentWebPushSubscription();
      if (subscription) {
        const result = await removeWebPushAction(subscription.endpoint);
        if (result.errorKey) return { errorKey: result.errorKey };
        await subscription.unsubscribe();
      }
      setState({ mode: 'ready', on: false });
      return { errorKey: null };
    } catch {
      // Tarayıcı aboneliği reddederse (bildirim servisine ulaşılamadı) anahtar eski hâline döner ve müşteri notu görür.
      return { errorKey: 'unexpected' };
    }
  }, []);

  return { ...state, toggle };
}
