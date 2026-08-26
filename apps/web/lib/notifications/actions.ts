'use server';

import {
  listNotifications,
  markAllNotificationsRead,
  unreadNotificationCount,
} from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { notificationsChannelName, type MeNotification } from '@lezzet/types';
import { currentCustomerId, requireStaff, AuthError } from '@/lib/guard';
import { CustomerError, customerErrorKey, type CustomerResult } from '@/lib/customer-error';
import { getErrorMessage, type ActionResult } from '@/lib/error';

/*
  ZİL AKSİYONLARI (14.15) — sayfaya değil KABUĞA ait olanlar, o yüzden `lib/`de (CLAUDE §2:
  paylaşılan yardımcı lib'e). İki zil var ve ikisi ayrı funnel'dan konuşur: müşteri zili
  `CustomerResult` (anahtar döner, metin ekranda), operasyon zili `ActionResult` (personel iç
  mesajı görebilir — `customer-error.ts` künyesindeki kapı ayrımı).

  Akışın SAYFA aksiyonları (okundu/gizle/devamını yükle) burada DEĞİL, sayfa klasöründe: onlar
  ekranın işi. Burada yalnız rozetin sayısı ve panelin kısa listesi yaşar.
*/

interface CustomerBadge {
  unread: number;
  /** Kişinin canlı kanalı — adı profilin UUID'sinden türer (doğal sır), yükü daima boş. */
  channel: string;
}

/** Hesap zilinin rozeti — sayı + dinlenecek kanal tek turda (zil bir kez sorar, sonra dinler). */
export async function customerNotificationBadgeAction(): Promise<CustomerResult<CustomerBadge>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');
    const unread = await unreadNotificationCount(serviceDb(), customerId);
    return { data: { unread, channel: notificationsChannelName(customerId) }, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/** Operasyon panelinin kısa listesi — son işlerin seçkisi; sayfalama yok (mobil kabuğun aynı kararı). */
const STAFF_PANEL_LIMIT = 15;

interface StaffNotificationsFeed {
  /** Zarf şekli mobil sözleşmeyle AYNI (`MeNotification`) — iki tüketici tek şekle bağlansın. */
  rows: MeNotification[];
  unread: number;
}

/**
 * Operasyon zilinin akışı. `profileId` GUARD'DAN — okuma kapısının uç güvenliği ilkesi: kimlik
 * istemciden asla. Personelin satırları fan-out anında rol × depo süzgeciyle yazıldı (14.12);
 * okuma tarafında ikinci bir süzgeç yok — kişinin satırı kişinindir.
 */
export async function staffNotificationsFeedAction(): Promise<ActionResult<StaffNotificationsFeed>> {
  try {
    const user = await requireStaff();
    const feed = await listNotifications(serviceDb(), { profileId: user.profileId, limit: STAFF_PANEL_LIMIT });
    return {
      data: {
        // Daraltma sözleşmenin kendisi (`me-notifications.schema` künyesi): `profileId`/`dedupeKey`/
        // `warehouseId` istemciye sızmaz — RSC/action telinden geçen her alan sayfa yükünde görünür.
        rows: feed.rows.map((row) => ({
          id: row.id,
          kind: row.kind,
          targetType: row.targetType,
          targetId: row.targetId,
          payload: row.payload,
          createdAt: row.createdAt,
          readAt: row.readAt,
        })),
        unread: feed.unread,
      },
      error: null,
    };
  } catch (e) {
    // Oturum düşmüşse panel sessizce boş kalmasın; kabuk zaten guard'lı, bu ancak süresi dolan oturum.
    if (e instanceof AuthError) return { data: null, error: 'Oturum bulunamadı — sayfayı yenileyin.' };
    return { data: null, error: getErrorMessage(e) };
  }
}

/** Panelin "gördüm" beyanı — açılış akışı okundu sayar (mobil kabuğun aynı kararı); satırlar listede kalır. */
export async function staffMarkAllNotificationsReadAction(): Promise<ActionResult<{ ok: true }>> {
  try {
    const user = await requireStaff();
    await markAllNotificationsRead(serviceDb(), user.profileId);
    return { data: { ok: true }, error: null };
  } catch (e) {
    return { data: null, error: getErrorMessage(e) };
  }
}
