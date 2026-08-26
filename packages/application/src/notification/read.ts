import { AppNotificationService } from '@lezzet/database';
import type { AppNotification, KeysetCursor } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
  ── BİLDİRİM OKUMASI (14.13) — web ve mobilin ORTAK kapısı ──────────────────────────────────────
  Uç (mobil `GET /me/notifications`) ve web hesap zili (14.15) aynı fonksiyonları çağırır; kural
  iki taşıma katmanına dağılmaz (mobil şeridin defterdeki isteği: "kuralın application'da olması
  kritik").

  ── UÇ GÜVENLİĞİ İLKESİ: `profileId` HER ZAMAN GUARD'DAN ───────────────────────────────────────
  Tek tabloda iki kitle (müşteri + personel) yaşıyor; yanlış süzgeç birinin akışını ötekine
  gösterirdi. Bu kapının hiçbir fonksiyonu kimliği İSTEMCİDEN almaz — çağıran taşıma katmanı onu
  oturumdan/guard'dan çözer ve buraya geçirir. Satır kimliği (istemciden gelen tek şey) daima
  sahiplik süzgeciyle birlikte kullanılır: yabancı kimlik "yok" cevabı alır, "yasak" değil —
  yasak, satırın VARLIĞINI söylerdi.
*/

export interface NotificationFeed {
  rows: AppNotification[];
  nextCursor: KeysetCursor | null;
  /** Okunmamış VE gizlenmemiş — tanım servis sabitinde, burada yeniden kurulmaz. */
  unread: number;
}

/**
 * **Akışı oku** — satırlar + imleç + rozet TEK turda (ekran açılışının tamamı).
 *
 * Gizlenenler yok (servis varsayılanı); okunmuşlar VAR — bildirim bir akıştır, gelen kutusu değil:
 * okunan satır listeden kaybolsaydı "az önce ne gelmişti" sorusunun cevabı da kaybolurdu.
 */
export async function listNotifications(
  db: SupabaseClient,
  input: { profileId: string; cursor?: KeysetCursor; limit?: number },
): Promise<NotificationFeed> {
  const service = new AppNotificationService(db);
  const [page, unread] = await Promise.all([
    service.listByProfile(input.profileId, { cursor: input.cursor, limit: input.limit }),
    service.unreadCount(input.profileId),
  ]);
  return { rows: page.rows, nextCursor: page.nextCursor, unread };
}

/** Rozet — zil çalınca liste çekmeden tazelenir (kanal yükü boş, sayıyı bu kapı söyler). */
export function unreadNotificationCount(db: SupabaseClient, profileId: string): Promise<number> {
  return new AppNotificationService(db).unreadCount(profileId);
}

/**
 * Tek satırı okundu işaretle. `not_found` iki hâli BİLEREK birleştirir — satır yok ve satır
 * başkasının: ayrıştırmak, kimlik tahmin eden birine satırın varlığını söylemek olurdu.
 */
export async function markNotificationRead(
  db: SupabaseClient,
  input: { profileId: string; notificationId: string },
): Promise<'ok' | 'not_found'> {
  const oldu = await new AppNotificationService(db).markReadOwned(input.notificationId, input.profileId);
  return oldu ? 'ok' : 'not_found';
}

/** Tümünü okundu say — "hepsini gördüm" düğmesi. Yalnız kendi satırları (imza bunu zorlar). */
export function markAllNotificationsRead(db: SupabaseClient, profileId: string): Promise<void> {
  return new AppNotificationService(db).markAllRead(profileId);
}

/** Satırı gizle — listeden kalkar, rozetten düşer; geçmiş silinmez (satır durur). */
export async function dismissNotification(
  db: SupabaseClient,
  input: { profileId: string; notificationId: string },
): Promise<'ok' | 'not_found'> {
  const oldu = await new AppNotificationService(db).dismissOwned(input.notificationId, input.profileId);
  return oldu ? 'ok' : 'not_found';
}
