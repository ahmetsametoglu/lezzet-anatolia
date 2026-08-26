import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AppNotificationInsertSchema,
  AppNotificationSchema,
  AppNotificationUpdateSchema,
  NotificationDeliveryInsertSchema,
  NotificationDeliverySchema,
  type AppNotification,
  type AppNotificationInsert,
  type AppNotificationUpdate,
  type KeysetCursor,
  type NotificationDelivery,
  type NotificationDeliveryInsert,
  type Page,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * **Bildirim kaydı** (14.12, migration 0049). Servis karar vermez, satır getirir/yazar (STACK §4):
 * hangi olayın satır yazacağı, kanal sırası ve BELGE güvencesi TEK KAPININ işidir
 * (`@lezzet/application/notification/dispatch`).
 *
 * ── OKUNMAMIŞ TANIMI TEK YERDE ──────────────────────────────────────────────
 * "Rozete sayılan satır" = `read_at is null AND dismissed_at is null`. Bu süzgeç yalnız burada
 * kurulur (`UNREAD`); sayaç ve liste aynı sabitten okur — iki yerde yazılsaydı rozet "3" deyip
 * liste iki satır gösterirdi (mobil kabuğun kendi künyesindeki tuzağın DB hâli).
 */
const UNREAD = { isNullFields: ['read_at', 'dismissed_at'] as string[] };

export class AppNotificationService extends BaseDbService<AppNotification, AppNotificationInsert, AppNotificationUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'notification', AppNotificationSchema, AppNotificationInsertSchema, AppNotificationUpdateSchema, false);
  }

  /**
   * Tekilleştirmeli yazım — `dedupe_key` çakışması SESSİZ `null` döner (olay zaten işlendi).
   * Anahtarsız satır hiç yarışmaz (kısmi unique). Çağıran `null`u "tekrar" diye okur ve kanala
   * da GÖNDERMEZ: satırı yutulan olayın maili gitseydi, defter ile posta kutusu ayrışırdı.
   */
  record(input: AppNotificationInsert): Promise<AppNotification | null> {
    return this.insertIgnoringConflict(input);
  }

  /**
   * Kişinin akışı — en yeni üstte, keyset (küme veriyle sınırsız büyür, CLAUDE §1).
   *
   * GİZLENENLER varsayılan olarak DIŞARIDA: gizlemenin bütün anlamı satırın listeden kalkması.
   * `includeDismissed` yalnız ileride bir "gizlenenleri göster" ekranı doğarsa açılır — okunmuş
   * satır ise listede KALIR (yalnız rozetten düşer): bildirim bir akıştır, gelen kutusu değil.
   */
  listByProfile(
    profileId: string,
    opts: { cursor?: KeysetCursor; limit?: number; includeDismissed?: boolean } = {},
  ): Promise<Page<AppNotification>> {
    return this.getPage(
      { profileId },
      {
        orderBy: 'createdAt',
        orderDirection: 'desc',
        keysetAfter: opts.cursor,
        limit: opts.limit ?? 20,
        ...(opts.includeDismissed ? {} : { isNullFields: ['dismissed_at'] }),
      },
    );
  }

  /**
   * **Sahiplik süzgeçli** okundu işareti — TEK deyimde: satır hem kimliğiyle hem SAHİBİYLE
   * eşleşmezse hiçbir şey güncellenmez ve `false` döner. İki sorguya bölmek (önce oku, sonra yaz)
   * hem bir tur fazlaydı hem de okuma ile yazma arasında sahibinin değişebildiği bir pencere
   * açardı — kimlik istemciden geliyor, süzgeç pazarlık konusu değil.
   */
  async markReadOwned(id: string, profileId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('notification')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('profile_id', profileId)
      .select('id');
    if (error) throw error;
    return (data ?? []).length > 0;
  }

  /** Sahiplik süzgeçli gizleme — `markReadOwned` ile aynı sözleşme. */
  async dismissOwned(id: string, profileId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('notification')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('profile_id', profileId)
      .select('id');
    if (error) throw error;
    return (data ?? []).length > 0;
  }

  /** Rozet sayacı — satır taşımadan (`head: true`), kısmi indeksin üstünde. */
  unreadCount(profileId: string): Promise<number> {
    return this.count({ profileId }, UNREAD);
  }

  /**
   * "Tümünü okundu say" — listeyi çekmeden, tek deyimde. Damga karşılaştırılMAdığı için uygulama
   * saati yeterli (customer_phone'daki iki-saat dersinin tersi: orada damga sessizlik hesabına
   * giriyordu, burada yalnız "dolu mu" diye okunuyor).
   */
  async markAllRead(profileId: string): Promise<void> {
    const { error } = await this.supabase
      .from('notification')
      .update({ read_at: new Date().toISOString() })
      .eq('profile_id', profileId)
      .is('read_at', null)
      .is('dismissed_at', null);
    if (error) throw error;
  }
}

/** Teslim defteri — bildirim olgusu ile kanala teslimi ayrı kayıtlardır (0049 künyesi). */
export class NotificationDeliveryService extends BaseDbService<
  NotificationDelivery,
  NotificationDeliveryInsert,
  NotificationDelivery
> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'notification_delivery',
      NotificationDeliverySchema,
      NotificationDeliveryInsertSchema,
      // Teslim kaydı DEĞİŞMEZ: yazıldığı anki gerçeği anlatır, güncellenecek bir hâli yoktur.
      NotificationDeliverySchema,
      false,
    );
  }

  listByNotification(notificationId: string): Promise<NotificationDelivery[]> {
    return this.getAll({ notificationId }, { orderBy: 'createdAt', orderDirection: 'asc' });
  }
}
