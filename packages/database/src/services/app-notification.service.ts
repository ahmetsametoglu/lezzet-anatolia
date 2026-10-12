import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AppNotificationInsertSchema,
  AppNotificationSchema,
  AppNotificationUpdateSchema,
  NotificationDeliveryInsertSchema,
  NotificationDeliverySchema,
  NotificationDeliveryUpdateSchema,
  STAFF_NOTIFICATION_KINDS,
  type AppNotification,
  type AppNotificationInsert,
  type AppNotificationKind,
  type AppNotificationUpdate,
  type KeysetCursor,
  type NotificationDelivery,
  type NotificationDeliveryInsert,
  type NotificationDeliveryUpdate,
  type Page,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Rozete sayılan satır: okunmamış ve gizlenmemiş. Süzgeç tek yerde kurulur, çünkü sayaç ile liste ayrı yazsaydı rozet başka sayı,
 * liste başka satır gösterirdi; hangi olayın satır yazacağı dağıtım kapısının işidir (`application/notification/dispatch`).
 */
const UNREAD = { isNullFields: ['read_at', 'dismissed_at'] as string[] };

/**
 * Kitle: tek tabloda iki kitle yaşar ve aynı kişi hem müşteri hem personel olabilir; müşteri yüzeyi personel türünü görmez ve saymaz,
 * operasyon yüzeyi yalnız onu görür. Küme `STAFF_NOTIFICATION_KINDS`tır, saklama süpürmesiyle aynı liste.
 */
export type NotificationAudience = 'customer' | 'staff';

/** PostgREST `or=(…)` grubu — tek koşullu grup düz süzgeçtir; `in` listesi buradan kurulur. */
function audienceFilter(audience: NotificationAudience): string {
  const liste = STAFF_NOTIFICATION_KINDS.join(',');
  return audience === 'staff' ? `kind.in.(${liste})` : `kind.not.in.(${liste})`;
}

export class AppNotificationService extends BaseDbService<AppNotification, AppNotificationInsert, AppNotificationUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'notification', AppNotificationSchema, AppNotificationInsertSchema, AppNotificationUpdateSchema, false);
  }

  /**
   * Tekilleştirmeli yazım: anahtar çakışması `null` döner ve çağıran onu "olay zaten işlendi" diye okuyup kanala göndermez, yoksa
   * defter ile posta kutusu ayrışırdı. Anahtarsız satır yarışmaz (kısmi tekil indeks).
   */
  record(input: AppNotificationInsert): Promise<AppNotification | null> {
    return this.insertIgnoringConflict(input);
  }

  /**
   * Kişinin akışı, en yeni üstte ve keyset sayfalı. Gizlenen satır dışarıda kalır, çünkü gizlemenin anlamı listeden kalkmaktır;
   * okunmuş satır kalır ve yalnız rozetten düşer.
   */
  listByProfile(
    profileId: string,
    opts: { cursor?: KeysetCursor; limit?: number; includeDismissed?: boolean; audience?: NotificationAudience } = {},
  ): Promise<Page<AppNotification>> {
    return this.getPage(
      { profileId },
      {
        orderBy: 'createdAt',
        orderDirection: 'desc',
        keysetAfter: opts.cursor,
        limit: opts.limit ?? 20,
        ...(opts.includeDismissed ? {} : { isNullFields: ['dismissed_at'] }),
        ...(opts.audience ? { orFilters: [audienceFilter(opts.audience)] } : {}),
      },
    );
  }

  /**
   * Sahiplik süzgeçli okundu işareti, tek deyimde: kimlik ve sahip birlikte eşleşmezse hiçbir şey yazılmaz ve `false` döner. Kimlik
   * istemciden gelir; önce okuyup sonra yazmak araya sahiplik değişikliği girebilen bir pencere açardı.
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

  /** Anahtarlı bildirimin ilk yazıldığı an, anahtar başına; satır kişi başına çoğaldığı için en erkeni alınır. */
  async firstSentAtByDedupeKey(kind: AppNotificationKind, keys: readonly string[]): Promise<Map<string, string>> {
    if (keys.length === 0) return new Map();
    const rows = await this.getAll({ kind, dedupeKey: [...keys] }, { orderBy: 'createdAt' });
    const first = new Map<string, string>();
    for (const row of rows) if (row.dedupeKey && !first.has(row.dedupeKey)) first.set(row.dedupeKey, row.createdAt);
    return first;
  }

  /** Rozet sayacı — satır taşımadan (`head: true`), kısmi indeksin üstünde. */
  unreadCount(profileId: string, audience?: NotificationAudience): Promise<number> {
    return this.count({ profileId }, { ...UNREAD, ...(audience ? { orFilters: [audienceFilter(audience)] } : {}) });
  }

  /** "Tümünü okundu say", listeyi çekmeden tek deyimde; damga yalnız "dolu mu" diye okunduğu için uygulama saati yeter. */
  async markAllRead(profileId: string, audience?: NotificationAudience, since?: string): Promise<void> {
    let query = this.supabase
      .from('notification')
      .update({ read_at: new Date().toISOString() })
      .eq('profile_id', profileId)
      .is('read_at', null)
      .is('dismissed_at', null);
    // Kitle süzgeci "gördüm" beyanına da uygulanır: müşteri ekranının "tümünü okundu say"ı
    // personel satırını okundu yapsaydı, operasyon rozeti kimse görmeden sönerdi (tersi de aynı).
    if (audience === 'staff') query = query.in('kind', [...STAFF_NOTIFICATION_KINDS]);
    else if (audience === 'customer') query = query.not('kind', 'in', `(${STAFF_NOTIFICATION_KINDS.join(',')})`);
    /* Yalnız ekranda görülen satırlar okundu olur: çağıran çizdiği en eski satırın damgasını verir. Görülmeyen satır damgalansaydı
       rozetten sessizce düşer ve saklama süpürmesi onu görülmüş sayıp silerdi. */
    if (since !== undefined) query = query.gte('created_at', since);
    const { error } = await query;
    if (error) throw error;
  }

  /**
   * Saklama süpürmesi: görülmüş (okunmuş ya da gizlenmiş) personel satırını siler ve sayıyı döner; okunmamış satır bekleyen iştir ve
   * yaşı ne olursa olsun durur. İki düz deyimdir, çünkü PostgREST silmede `or=` süzgecini reddeder; kümeler kesişmez.
   */
  async purgeSeenStaffBefore(cutoffIso: string, kinds: readonly string[]): Promise<number> {
    if (kinds.length === 0) return 0;
    const okunmus = await this.supabase
      .from('notification')
      .delete()
      .in('kind', [...kinds])
      .lt('created_at', cutoffIso)
      .not('read_at', 'is', null)
      .select('id');
    if (okunmus.error) throw okunmus.error;

    const gizlenmis = await this.supabase
      .from('notification')
      .delete()
      .in('kind', [...kinds])
      .lt('created_at', cutoffIso)
      .is('read_at', null)
      .not('dismissed_at', 'is', null)
      .select('id');
    if (gizlenmis.error) throw gizlenmis.error;

    return (okunmus.data?.length ?? 0) + (gizlenmis.data?.length ?? 0);
  }
}

/** Teslim defteri — bildirim olgusu ile kanala teslimi ayrı kayıtlardır (0049 künyesi). */
export class NotificationDeliveryService extends BaseDbService<
  NotificationDelivery,
  NotificationDeliveryInsert,
  NotificationDeliveryUpdate
> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'notification_delivery',
      NotificationDeliverySchema,
      NotificationDeliveryInsertSchema,
      // Gönderim kaydı değişmez; değişebilen tek yüz makbuzdur ve güncelleme şeması yalnız onu açar.
      NotificationDeliveryUpdateSchema,
      false,
    );
  }

  listByNotification(notificationId: string): Promise<NotificationDelivery[]> {
    return this.getAll({ notificationId }, { orderBy: 'createdAt', orderDirection: 'asc' });
  }

  /**
   * Makbuzu sorulmamış push teslimleri — süpürme turunun tek okuması (kısmi indeks üstünde).
   * `olderThan` şart: Expo makbuzu hemen üretmez; taze teslimi sormak boş tur attırır.
   */
  listUncheckedPush(olderThan: string, limit: number): Promise<NotificationDelivery[]> {
    return this.getAll(
      { channel: 'push', status: 'sent' },
      {
        isNullFields: ['receipt_checked_at'],
        rangeFilters: [{ field: 'createdAt', operator: 'lte', value: olderThan }],
        orderBy: 'createdAt',
        orderDirection: 'asc',
        limit,
      },
    );
  }

  /** Makbuzu işle — teslim satırının değişebilen tek yüzü (şema zorluyor). */
  markReceipt(id: string, receiptStatus: string): Promise<NotificationDelivery> {
    return this.update({ id, receiptStatus, receiptCheckedAt: new Date().toISOString() });
  }
}
