import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import type * as NotificationsModule from 'expo-notifications';

import { notificationHref } from '@/screens/notifications/notification-copy';
import { pushNative } from './native-module';

/*
  PUSH DOKUNUŞU → EKRAN (14.16 / 21.13'ün "dokununca doğru ekrana gitme" maddesi).

  Sunucu bildirime `data` yükü koyar ({kind, targetType, targetId, payload} — sürücü künyesi);
  burada okunur ve adres MEVCUT sözlükten çözülür (`notificationHref`) — uygulama içi listede
  satıra dokunmakla, cihaz bildirimine dokunmak AYNI adrese gider; iki eşleme olsaydı biri gün
  gelip başka yere götürürdü (CLAUDE §1).

  İki an dinlenir, ikisi tek dinleyicide:
  · Uygulama AÇIKKEN/arka plandayken dokunuş — `addNotificationResponseReceivedListener`.
  · Uygulama bildirimle SOĞUK açıldıysa — `getLastNotificationResponseAsync` (dinleyici kurulmadan
    önce gelen dokunuş kaybolmasın; v57 dokümanının önerdiği ikili).

  Adres çözülemezse (bilinmeyen tür, hedefsiz satır) hiçbir şey yapılmaz: bildirimin kendisi
  uygulamayı zaten açtı, vitrin en dürüst varsayılan.
*/
export function usePushNavigation(): void {
  const router = useRouter();

  useEffect(() => {
    const yonlendir = (response: NotificationsModule.NotificationResponse | null) => {
      const data = response?.notification.request.content.data as
        | { kind?: unknown; targetType?: unknown; targetId?: unknown; payload?: unknown }
        | undefined;
      if (!data || typeof data.kind !== 'string') return;
      const href = notificationHref({
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
  }, [router]);
}
