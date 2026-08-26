import { z } from 'zod';
import { MeNotificationBadgeSchema, MeNotificationsPageSchema } from '@lezzet/types';

import { authorizedFetch } from '../auth/authorized-fetch';
import type { ApiResult } from './client';

/*
  `/api/v1/me/notifications` — zilin veri kaynağı (14.13). KURAL UÇTA DEĞİL, uç da taşıma
  katmanı: sahiplik süzgeci, "akış ≠ gelen kutusu" ve rozet tanımı `@lezzet/application`ın
  okuma kapısında. Burada yalnız çağrı + şema doğrulaması var (points.ts kalıbı).

  Satır METİN taşımaz: `kind` + dil-bağımsız `payload` gelir, cümleyi ekran kurar
  (`notification-copy.ts`) — puan geçmişinin "sebep bir ANAHTAR" kararının aynısı.
*/

export type NotificationsPage = z.infer<typeof MeNotificationsPageSchema>;
export type NotificationRow = NotificationsPage['notifications'][number];

export function fetchNotifications(cursor?: string): Promise<ApiResult<NotificationsPage>> {
  const query = cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`;
  return authorizedFetch(`/api/v1/me/notifications${query}`, MeNotificationsPageSchema);
}

/** Rozet — zil çalınca (kanal yükü boş) ya da sekmeye dönünce, LİSTE ÇEKMEDEN tazeleme. */
export function fetchNotificationBadge(): Promise<ApiResult<z.infer<typeof MeNotificationBadgeSchema>>> {
  return authorizedFetch('/api/v1/me/notifications/badge', MeNotificationBadgeSchema);
}

const DoneSchema = z.object({ done: z.boolean() });

export function markNotificationRead(id: string): Promise<ApiResult<z.infer<typeof DoneSchema>>> {
  return authorizedFetch(`/api/v1/me/notifications/${id}/read`, DoneSchema, { method: 'POST' });
}

export function markAllNotificationsRead(): Promise<ApiResult<z.infer<typeof DoneSchema>>> {
  return authorizedFetch('/api/v1/me/notifications/read-all', DoneSchema, { method: 'POST' });
}

export function dismissNotification(id: string): Promise<ApiResult<z.infer<typeof DoneSchema>>> {
  return authorizedFetch(`/api/v1/me/notifications/${id}/dismiss`, DoneSchema, { method: 'POST' });
}

/*
  Cihaz jetonu uçları (14.14) — jeton hiçbir cevapta geri okutulmaz ve URL'e yazılmaz (erişim
  logları): iki uç da POST, jeton gövdede. Kayıt her açılışta tazelenir ve İZİN DURUMUNU da
  raporlar (izni kapalı cihaza "gönderdim" demek sessiz kara deliktir — sunucu onu listeden düşürür).
*/

const RemovedSchema = z.object({ removed: z.boolean() });

export function registerPushDevice(input: { token: string; platform: 'ios' | 'android'; enabled: boolean }): Promise<ApiResult<z.infer<typeof DoneSchema>>> {
  return authorizedFetch('/api/v1/me/push-devices', DoneSchema, { method: 'POST', body: JSON.stringify(input), headers: { 'content-type': 'application/json' } });
}

export function removePushDevice(token: string): Promise<ApiResult<z.infer<typeof RemovedSchema>>> {
  return authorizedFetch('/api/v1/me/push-devices/remove', RemovedSchema, { method: 'POST', body: JSON.stringify({ token }), headers: { 'content-type': 'application/json' } });
}
