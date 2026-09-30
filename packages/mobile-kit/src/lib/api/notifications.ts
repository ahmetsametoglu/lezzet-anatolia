import { z } from 'zod';
import { MeNotificationBadgeSchema, MeNotificationsPageSchema, type PushApp } from '@lezzet/types';

import { authorizedFetch } from '../auth/authorized-fetch';
import type { ApiResult } from './client';

/*
  `/api/v1/me/notifications` zilin veri kaynağıdır; kural uçta değil, sahiplik süzgeci ve rozet tanımı `@lezzet/application`ın
  okuma kapısında. Satır metin taşımaz: `kind` ve dil-bağımsız `payload` gelir, cümleyi ekran kurar (`notification-copy.ts`).
*/

export type NotificationsPage = z.infer<typeof MeNotificationsPageSchema>;
export type NotificationRow = NotificationsPage['notifications'][number];

/** Kitle: müşteri ekranı varsayılanla (`customer`) okur, operasyon kabuğu `staff` ister; personel satırı müşteri akışına düşmez. */
export type NotificationAudience = 'customer' | 'staff';

export function fetchNotifications(cursor?: string, audience: NotificationAudience = 'customer'): Promise<ApiResult<NotificationsPage>> {
  const params = new URLSearchParams();
  if (cursor !== undefined) params.set('cursor', cursor);
  if (audience !== 'customer') params.set('audience', audience);
  const query = params.size > 0 ? `?${params.toString()}` : '';
  return authorizedFetch(`/api/v1/me/notifications${query}`, MeNotificationsPageSchema);
}

/**
 * Rozet: zil çalınca ya da sekmeye dönünce liste çekmeden tazelenir. Kitle parametre olarak gelir, çünkü operasyon zili varsayılana
 * (`customer`) düşseydi müşteri sayısını gösterirdi.
 */
export function fetchNotificationBadge(audience: NotificationAudience = 'customer'): Promise<ApiResult<z.infer<typeof MeNotificationBadgeSchema>>> {
  const query = audience === 'customer' ? '' : `?audience=${audience}`;
  return authorizedFetch(`/api/v1/me/notifications/badge${query}`, MeNotificationBadgeSchema);
}

const DoneSchema = z.object({ done: z.boolean() });

export function markNotificationRead(id: string): Promise<ApiResult<z.infer<typeof DoneSchema>>> {
  return authorizedFetch(`/api/v1/me/notifications/${id}/read`, DoneSchema, { method: 'POST' });
}

/**
 * "Buraya kadarını gördüm": `since` çizilen en eski satırın damgasıdır ve beyan yalnız ondan yeni satırları kapsar. Sayfanın
 * arkasında kalan satırı okundu yapmak onu rozetten düşürür ve saklama süpürmesine yem eder.
 */
export function markAllNotificationsRead(audience: NotificationAudience = 'customer', since?: string): Promise<ApiResult<z.infer<typeof DoneSchema>>> {
  const params = new URLSearchParams();
  if (audience !== 'customer') params.set('audience', audience);
  if (since !== undefined) params.set('since', since);
  const query = params.size > 0 ? `?${params.toString()}` : '';
  return authorizedFetch(`/api/v1/me/notifications/read-all${query}`, DoneSchema, { method: 'POST' });
}

export function dismissNotification(id: string): Promise<ApiResult<z.infer<typeof DoneSchema>>> {
  return authorizedFetch(`/api/v1/me/notifications/${id}/dismiss`, DoneSchema, { method: 'POST' });
}

/*
  Cihaz jetonu uçları: jeton hiçbir cevapta geri okutulmaz ve URL'e yazılmaz, iki uç da POST ve jeton gövdede. Kayıt her açılışta
  tazelenir ve izin durumunu da raporlar, çünkü izni kapalı cihaza "gönderdim" demek sessiz kara deliktir.
*/

const RemovedSchema = z.object({ removed: z.boolean() });

export function registerPushDevice(input: { token: string; platform: 'ios' | 'android'; app: PushApp; enabled: boolean }): Promise<ApiResult<z.infer<typeof DoneSchema>>> {
  return authorizedFetch('/api/v1/me/push-devices', DoneSchema, { method: 'POST', body: JSON.stringify(input), headers: { 'content-type': 'application/json' } });
}

export function removePushDevice(token: string): Promise<ApiResult<z.infer<typeof RemovedSchema>>> {
  return authorizedFetch('/api/v1/me/push-devices/remove', RemovedSchema, { method: 'POST', body: JSON.stringify({ token }), headers: { 'content-type': 'application/json' } });
}
