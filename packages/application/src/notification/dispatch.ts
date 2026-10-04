import { AppNotificationService, NotificationDeliveryService, UserProfileService } from '@lezzet/database';
import {
  defaultNotifier,
  NOTIFY_EVENT_META,
  sendExpoPush,
  sendWebPush,
  type DevicePushMessage,
  type Notifier,
  type NotifyChannel,
  type NotifyEventName,
  type NotifyPayloads,
  type NotifyRecipient,
  type NotifyResult,
  type WebPushMessage,
} from '@lezzet/notify';
import { notificationSentence, notificationTitle, opsNotificationHref, staffNotificationBrief } from '@lezzet/i18n';
import { captureError, logger, SOURCES } from '@lezzet/observability';
import { PUSH_CHANNEL, type AppNotificationKind, type NotificationTargetType, type StaffRole, type WebPushSubscription } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ringNotificationsBell, ringStaffNotificationsBell } from '../realtime/bell';
import { listSendablePushTargets, prunePushTargets } from './devices';

/*
  Her olay önce kayda yazılır (zil, okundu hâli ve teslim defteri onun öznesidir), sonra kanala gider; gönderim düşerse satır kalır,
  çünkü olay gerçekten olmuştur. `dedupe_key` çakışan olayda satır da kanal da atlanır, yoksa defter ile posta kutusu ayrışırdı.
*/

export interface NotificationTargetRef {
  type: NotificationTargetType;
  id: string;
}

export interface CustomerNotificationInput<E extends NotifyEventName> {
  event: E;
  /** `null` = satır yazılmaz, yalnız kanal denenir: hesabı olmayan alıcının (çoğunlukla bölge haberi) satırı hiçbir zile düşemez. */
  customerId: string | null;
  recipient: NotifyRecipient;
  data: NotifyPayloads[E];
  target?: NotificationTargetRef | null;
  /** Formülü olay tanımlar; çift tetiği olmayan olayda verilmez (0049 künyesi). */
  dedupeKey?: string | null;
  /** Dil-bağımsız, kimliksiz küçük veri — cümle hedefe gitmeden kurulsun (şema künyesi). */
  payload?: Record<string, unknown>;
}

export interface DispatchOpts {
  /** Test/enjeksiyon — gerçek sürücü listesi yerine sahte notifier (SupportAiOpts deseni). */
  notifier?: Notifier;
  /** Yalnız bu kanallar denenir; verilmezse olayın sınıf planı geçerlidir. */
  channels?: readonly NotifyChannel[];
  /** `false`: satır yazılmaz ve zil çalmaz, ki aynı olayın sonradan giden ikinci kanalı ilk gönderimin satırını tekrarlamasın. */
  inApp?: boolean;
}

/**
 * Dönüş `NotifyResult[]`, çünkü çağıranlar gönderim sonucunu okuyor; tekrarda tek elemanlı `skipped/duplicate` döner. BELGE sınıfı
 * olayda alıcının e-postası yoksa yöneticiye `document_undeliverable` yazılır, çünkü adressizlik kalıcıdır ve ancak insan çözer.
 */
export async function dispatchCustomerNotification<E extends NotifyEventName>(
  db: SupabaseClient,
  input: CustomerNotificationInput<E>,
  opts: DispatchOpts = {},
): Promise<NotifyResult[]> {
  const meta = NOTIFY_EVENT_META[input.event];
  const inApp = meta.inApp && opts.inApp !== false;

  let rowId: string | null = null;
  if (inApp && input.customerId) {
    const row = await new AppNotificationService(db).record({
      profileId: input.customerId,
      // Müşteri olay adları `AppNotificationKind` ile AYNI sözlük (şema künyesi) — eşleme yok.
      kind: input.event as AppNotificationKind,
      targetType: input.target?.type ?? null,
      targetId: input.target?.id ?? null,
      payload: input.payload ?? {},
      dedupeKey: input.dedupeKey ?? null,
    });
    if (!row && input.dedupeKey) {
      // Olay zaten işlendi: kanal da tekrarlanmaz (yukarıdaki "tekrar" kuralı).
      return [{ status: 'skipped', channel: 'email', reason: 'duplicate' }];
    }
    rowId = row?.id ?? null;
  }

  /*
    Cihazlar tek yerde doldurulur, çünkü sürücü DB bilmez ve her çağırana cihaz getirtmek unutulan gün push'u sessizce düşürürdü.
    Zile düşmeyen olayda sorgu hiç atılmaz: push da bir zildir.
  */
  // Müşteri bildirimi yalnız müşteri uygulamasının cihazlarına gider.
  const targets = inApp && input.customerId ? await listSendablePushTargets(db, input.customerId, 'customer') : null;
  const recipient: NotifyRecipient =
    targets
      ? {
          ...input.recipient,
          pushTokens: targets.native,
          webPush: targets.web,
          pushText: {
            title: notificationTitle({ kind: input.event, payload: input.payload ?? {} }, input.recipient.locale),
            body: notificationSentence({ kind: input.event, payload: input.payload ?? {} }, input.recipient.locale),
          },
          // Dokunuşun adresi — bildirime basan kullanıcı doğru ekrana insin (sürücü künyesi).
          pushData: {
            kind: input.event,
            targetType: input.target?.type ?? null,
            targetId: input.target?.id ?? null,
            payload: input.payload ?? {},
          },
        }
      : input.recipient;

  const results = await (opts.notifier ?? defaultNotifier()).send(input.event, recipient, input.data, { channels: opts.channels });

  await pruneGone(db, results);
  if (rowId) {
    await recordDeliveries(db, rowId, results);
    await ringNotificationsBell(input.customerId!);
  }

  if (meta.class === 'document' && !input.recipient.email) {
    await dispatchStaffNotification(db, {
      kind: 'document_undeliverable',
      roles: ['admin'],
      target: input.target ?? null,
      // Olay adı payload'da: yönetici "hangi belge" sorusunu satırdan okur; kişisel veri yok.
      payload: { event: input.event, ...(input.payload ?? {}) },
      dedupeKey: input.dedupeKey ? `undeliverable:${input.dedupeKey}` : null,
    });
  }

  return results;
}

export interface StaffNotificationInput {
  kind: AppNotificationKind;
  /** Kimlere — rol kesişimi (çoklu rol olağan, DOMAIN §2). */
  roles: StaffRole[];
  /**
   * Depo bağlamlı olayda zorunlu süzgeç: depocu ve kurye yalnız kendi deposunun olayını alır, admin ve muhasebe depo üstüdür.
   * `null` = depoya bağlı olmayan olay.
   */
  warehouseId?: string | null;
  target?: NotificationTargetRef | null;
  payload?: Record<string, unknown>;
  /** Profil BAŞINA tekilleştirilir (0049 kısmi unique) — fan-out'un her satırı kendi anahtarını taşır. */
  dedupeKey?: string | null;
}

/** Depo-üstü roller — kapsam süzgeci onlara uygulanmaz (0001: "admin/muhasebe depo-üstüdür"). */
const WAREHOUSE_EXEMPT: readonly StaffRole[] = ['admin', 'accounting'];

/** Cihaz göndericileri; test ağ yerine sahtesini verir. */
export interface StaffPushSenders {
  native: (tokens: readonly string[], message: DevicePushMessage) => Promise<NotifyResult>;
  web: (subscriptions: readonly WebPushSubscription[], message: WebPushMessage) => Promise<NotifyResult>;
}

const STAFF_PUSH: StaffPushSenders = {
  native: (tokens, message) => sendExpoPush(tokens, message),
  web: (subscriptions, message) => sendWebPush(subscriptions, message),
};

/**
 * Yazarken dağıtılır, çünkü rozet sayacı sıcak yoldur ve satır kişiye ait okundu hâli taşır; rolü sonradan verilen personel eski
 * bildirimleri görmez. Yazılan satır zille birlikte kişinin operasyon cihazlarına da gider.
 */
export async function dispatchStaffNotification(
  db: SupabaseClient,
  input: StaffNotificationInput,
  opts: { push?: StaffPushSenders } = {},
): Promise<string[]> {
  const staff = await new UserProfileService(db).listStaff();
  const alicilar = staff.filter((profile) => {
    const roller = profile.roles.filter((role): role is StaffRole => (input.roles as string[]).includes(role));
    if (roller.length === 0) return false;
    if (!input.warehouseId) return true;
    // Depo süzgeci: muaf rolü olan geçer; kalanlar kapsam kesişimiyle.
    if (roller.some((role) => WAREHOUSE_EXEMPT.includes(role))) return true;
    return profile.warehouseIds.includes(input.warehouseId);
  });
  if (alicilar.length === 0) {
    // Alıcısız personel bildirimi bir ARIZA işaretidir (rolü boş kalmış kurulum) — sessiz geçilmez.
    logger.warn({ kind: input.kind, roles: input.roles, warehouseId: input.warehouseId ?? null }, 'bildirim: personel olayının alıcısı yok');
    return [];
  }

  const notifications = new AppNotificationService(db);
  // Kimlikler ÇAĞIRANA döner — dönüşün asıl tüketicisi test temizliğidir: fan-out satırları
  // GERÇEK personel profillerine yazılır (seed yöneticileri dahil) ve profil-cascade'li purge
  // onları göremez; kimliği elinde tutmayan test, paylaşılan DB'de iz bırakır (CLAUDE §4b).
  const yazilan: { profileId: string; rowId: string }[] = [];
  for (const profile of alicilar) {
    const row = await notifications.record({
      profileId: profile.id,
      kind: input.kind,
      targetType: input.target?.type ?? null,
      targetId: input.target?.id ?? null,
      warehouseId: input.warehouseId ?? null,
      payload: input.payload ?? {},
      dedupeKey: input.dedupeKey ?? null,
    });
    if (row) yazilan.push({ profileId: profile.id, rowId: row.id });
  }

  if (yazilan.length > 0) await ringStaffNotificationsBell();
  await pushStaffRows(db, input, yazilan, opts.push ?? STAFF_PUSH);
  return yazilan.map((row) => row.rowId);
}

/**
 * Telefondaki operasyon uygulamasına ve masaüstündeki panele gider; sessiz tondaki satır yalnız zile düşer, çünkü push dikkat çeker.
 * Tanınmayan tür başlıksız kalacağı için cihaza hiç gitmez.
 */
async function pushStaffRows(
  db: SupabaseClient,
  input: StaffNotificationInput,
  rows: readonly { profileId: string; rowId: string }[],
  senders: StaffPushSenders,
): Promise<void> {
  const target = { kind: input.kind, targetType: input.target?.type ?? null, targetId: input.target?.id ?? null, payload: input.payload ?? {} };
  const brief = staffNotificationBrief(target);
  if (!brief || brief.tone === 'quiet' || rows.length === 0) return;

  const text = { title: brief.title, ...(brief.subtitle ? { body: brief.subtitle } : {}) };
  // Hedefsiz satır da bir yere açılır: tıklanan bildirimin hiçbir şey yapmaması, onu bozuk sandırırdı.
  const url = opsNotificationHref(target) ?? '/operations';
  await Promise.all(
    rows.map(async ({ profileId, rowId }) => {
      try {
        const devices = await listSendablePushTargets(db, profileId, 'operations');
        const results = await Promise.all([
          ...(devices.native.length > 0 ? [senders.native(devices.native, { ...text, data: target, channelId: PUSH_CHANNEL.operations })] : []),
          ...(devices.web.length > 0 ? [senders.web(devices.web, { ...text, url })] : []),
        ]);
        await pruneGone(db, results);
        await recordDeliveries(db, rowId, results);
      } catch (err) {
        // Haber zilde kalır; push bir hızlandırıcıdır, olayın kendisi değil.
        await captureError(err, {
          source: SOURCES.applicationNotification,
          level: 'warning',
          context: { flow: 'notification/staff-push', notificationId: rowId },
        });
      }
    }),
  );
}

/** Taşıyıcının "yok" dediği abonelik silinir; silinemezse bir sonraki haberde yine 410 döner ve yine denenir. */
async function pruneGone(db: SupabaseClient, results: readonly NotifyResult[]): Promise<void> {
  const gone = results.flatMap((result) => (result.status === 'skipped' ? [] : (result.gone ?? [])));
  if (gone.length === 0) return;
  try {
    await prunePushTargets(db, gone);
  } catch (err) {
    await captureError(err, { source: SOURCES.applicationNotification, level: 'warning', context: { flow: 'notification/prune', count: gone.length } });
  }
}

/** Teslim kaydı düşerse bildirim düşmez: defter, olgunun kendisinden önemli değildir. */
async function recordDeliveries(db: SupabaseClient, notificationId: string, results: readonly NotifyResult[]): Promise<void> {
  const deliveries = new NotificationDeliveryService(db);
  for (const result of results) {
    try {
      await deliveries.insert({
        notificationId,
        channel: result.channel,
        status: result.status,
        reason: result.status === 'skipped' ? result.reason : result.status === 'error' ? result.error : (result.partial ?? null),
        ref: result.status === 'sent' ? result.ref : null,
      });
    } catch (err) {
      await captureError(err, {
        source: SOURCES.applicationNotification,
        level: 'warning',
        context: { flow: 'notification/dispatch', notificationId, channel: result.channel },
      });
    }
  }
}
