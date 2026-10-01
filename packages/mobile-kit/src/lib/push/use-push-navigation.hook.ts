import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import type * as NotificationsModule from 'expo-notifications';

import type { NotificationRow } from '../api/notifications';
import { pushNative } from './native-module';

/*
  Push dokunuşu → ekran: sunucunun `data` yükü ({kind, targetType, targetId, payload}) uygulamanın kendi eşlemesiyle (`resolveHref`)
  adrese çevrilir, böylece listedeki satıra ve cihaz bildirimine dokunmak aynı yere gider. Dokunuş iki anda dinlenir, açıkken gelen
  (`addNotificationResponseReceivedListener`) ve uygulamayı soğuk açan (`getLastNotificationResponseAsync`); çözülemeyen adres hiçbir şey yapmaz.
*/
/** Bildirimin dokunuş hedefi — uygulama içi listenin satırıyla aynı alanlar. */
type PushTarget = Pick<NotificationRow, 'kind' | 'targetType' | 'targetId' | 'payload'>;

export function usePushNavigation(resolveHref: (target: PushTarget) => string | null): void {
  const router = useRouter();

  useEffect(() => {
    const yonlendir = (response: NotificationsModule.NotificationResponse | null) => {
      const data = response?.notification.request.content.data as
        | { kind?: unknown; targetType?: unknown; targetId?: unknown; payload?: unknown }
        | undefined;
      if (!data || typeof data.kind !== 'string') return;
      const href = resolveHref({
        kind: data.kind,
        targetType: (typeof data.targetType === 'string' ? data.targetType : null) as never,
        targetId: typeof data.targetId === 'string' ? data.targetId : null,
        payload: (data.payload ?? {}) as Record<string, unknown>,
      });
      if (href !== null) router.push(href as never);
    };

    /* Modül binary'de yoksa hiç kurulmaz — kapı `pushNative` (künyesi orada): statik import
       derlenmemiş kurulumu açılışta düşürüyordu. */
    const Notifications = pushNative();
    if (!Notifications) return undefined;

    /* Env'siz/native-modülsüz ortamda (test, Expo Go Android) kurulum fırlayabilir — künyeli
       yutma (kayıt hook'unun aynısı): dokunuş yönlendirmesi bir hızlandırıcıdır. */
    try {
      void Notifications.getLastNotificationResponseAsync().then(yonlendir).catch(() => undefined);
      const abonelik = Notifications.addNotificationResponseReceivedListener(yonlendir);
      return () => abonelik.remove();
    } catch {
      return undefined;
    }
  }, [router, resolveHref]);
}
