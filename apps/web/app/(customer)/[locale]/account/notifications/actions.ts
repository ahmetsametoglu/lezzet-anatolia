'use server';

import type { KeysetCursor } from '@lezzet/types';
import { serviceDb } from '@lezzet/database';
import {
  dismissNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@lezzet/application';
import { currentCustomerId } from '@/lib/guard';
import { CustomerError, customerErrorKey, type CustomerResult } from '@/lib/customer-error';
import { FEED_PAGE_SIZE, type NotificationsFeedPage } from './notifications-types';

/*
  Bildirim akışının yazma/sayfalama eylemleri (14.15). Kural `@lezzet/application`da
  (`notification/read.ts` — mobil uçla AYNI kapı); burası taşıma katmanı: kimliği OTURUMDAN çözer
  (uç güvenliği ilkesi: `profileId` istemciden asla), sonucu sayfanın şekline koyar.

  `not_found` hata OLARAK dönmez: satır ya silinmiş ya başkasının — ikisinde de ekranın yapacağı
  tek şey iyimser işareti geri almaktır; ayrım kimlik tahmin edene satırın varlığını söylerdi.
*/

function toPage(feed: Awaited<ReturnType<typeof listNotifications>>): NotificationsFeedPage {
  return {
    // Daraltma sözleşmenin kendisi (`me-notifications.schema` künyesi): `profileId`/`dedupeKey`/
    // `warehouseId`/`dismissedAt` istemciye sızmaz — action telinden geçen her alan sayfa yükünde.
    rows: feed.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      targetType: row.targetType,
      targetId: row.targetId,
      payload: row.payload,
      createdAt: row.createdAt,
      readAt: row.readAt,
    })),
    nextCursor: feed.nextCursor,
    unread: feed.unread,
  };
}

/** İlk sayfa sunucu render'ında gelir; bu eylem hem "devamı" hem zil çalınca tam tazelemedir. */
export async function loadNotificationsAction(cursor?: KeysetCursor): Promise<CustomerResult<NotificationsFeedPage>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');
    const feed = await listNotifications(serviceDb(), { profileId: customerId, audience: 'customer', cursor, limit: FEED_PAGE_SIZE });
    return { data: toPage(feed), errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

export async function markNotificationReadAction(notificationId: string): Promise<CustomerResult<{ ok: boolean }>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');
    const sonuc = await markNotificationRead(serviceDb(), { profileId: customerId, notificationId });
    return { data: { ok: sonuc === 'ok' }, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

export async function markAllNotificationsReadAction(): Promise<CustomerResult<{ ok: true }>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');
    await markAllNotificationsRead(serviceDb(), customerId, 'customer');
    return { data: { ok: true }, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

export async function dismissNotificationAction(notificationId: string): Promise<CustomerResult<{ ok: boolean }>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');
    const sonuc = await dismissNotification(serviceDb(), { profileId: customerId, notificationId });
    return { data: { ok: sonuc === 'ok' }, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}
