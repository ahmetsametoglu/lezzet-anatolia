import { AppNotificationService, NotificationDeliveryService, UserProfileService } from '@lezzet/database';
import {
  defaultNotifier,
  NOTIFY_EVENT_META,
  type Notifier,
  type NotifyEventName,
  type NotifyPayloads,
  type NotifyRecipient,
  type NotifyResult,
} from '@lezzet/notify';
import { captureError, logger, SOURCES } from '@lezzet/observability';
import type { AppNotificationKind, NotificationTargetType, StaffRole } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ringNotificationsBell, ringStaffNotificationsBell } from '../realtime/bell';
import { listSendablePushTokens } from './devices';

/*
  ── BİLDİRİMİN TEK KAPISI (14.12) ────────────────────────────────────────────────────────────────
  Bugüne kadar olay doğduğu an maile dönüşüyor ve HİÇBİR İZ KALMIYORDU. Artık her olay önce KAYDA
  yazılır (uygulama içi zilin, okundu hâlinin ve teslim defterinin öznesi), sonra kanala gider.

  İki iş TEK kapıda, çünkü iki ayrı yerde "hem satır hem mail" yazılsaydı biri bir gün unutulur ve
  "mailde var, uygulamada yok" hâli doğardı (mobil şeridin defterdeki uyarısı). Beş yayım noktası
  da (sipariş · talep · davet · bölge · B2B) buradan geçer.

  ── SIRA: ÖNCE SATIR, SONRA KANAL ────────────────────────────────────────────────────────────────
  Satır olgudur ("şu oldu"), kanal teslimi ise o olgunun taşınması. Gönderim düşerse satır KALIR —
  uygulama içi liste kendi başına bir kanaldır ve olay gerçekten olmuştur; teslim defteri düşüşü
  `error` olarak yazar. Ters sıra, maili gitmiş ama satırı yazılamamış olay üretirdi: müşteri
  posta kutusunda gördüğünü uygulamada bulamazdı.

  ── TEKRAR = SATIR DA KANAL DA YOK ───────────────────────────────────────────────────────────────
  `dedupe_key` çakışan olay bütünüyle yutulur (sessizce değil: sonuç `duplicate` der). Satırı
  yutup maili göndermek defter ile posta kutusunu ayrıştırırdı; formülü OLAY tanımlar (0049).
*/

export interface NotificationTargetRef {
  type: NotificationTargetType;
  id: string;
}

export interface CustomerNotificationInput<E extends NotifyEventName> {
  event: E;
  /**
   * Satırın öznesi — `null` = satır YAZILMAZ, yalnız kanal denenir. Bilinçli bir kapı: bazı
   * alıcıların hesabı yok (`zone_available` çoğunlukla ziyaretçi e-postası) ve profilsiz satır
   * uygulama içi hiçbir zile düşemez; onlara bildirim maili bugüne kadar nasılsa öyle gider.
   */
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
}

/**
 * **Müşteriye haber ver** — kaydı yazar, kanala gönderir, teslimi deftere işler, zili çalar.
 *
 * Dönüş `NotifyResult[]` ve bu bilinçli: beş çağıran bugün `notifier.send`in dönüşünü okuyor
 * (davet damgası `sent` arıyor, bölge işi `delivered` sayıyor); sözleşme değişseydi hepsi birden
 * elden geçerdi. Tekrarda tek elemanlı `skipped/duplicate` döner — çağıranların "gönderilmedi"
 * okuması doğru kalır.
 *
 * ── BELGE GÜVENCESİ (karşı-inceleme 2 + ölçüm) ──────────────────────────────
 * `document` sınıfı bir olay, alıcının E-POSTASI YOKSA insana düşer: `document_undeliverable`
 * satırı yöneticiye yazılır. Ölçülen gerçek şuydu: e-postasız müşterinin sipariş onayı `wa_link`
 * "sent" raporluyor ama üretimde bağlantı HİÇBİR YERE gitmiyordu (`onLink` boş) — dayanıklı
 * ortam yükümlülüğü olan belge sessizce kayboluyordu. Eşik bilerek "adres yok"tur, "gönderim
 * düştü" değil: sağlayıcı arızası teslim defterinde `error` olarak zaten görünür ve geçicidir;
 * adressizlik ise kalıcıdır ve ancak insan çözer (telefonla ister, elden verir).
 */
export async function dispatchCustomerNotification<E extends NotifyEventName>(
  db: SupabaseClient,
  input: CustomerNotificationInput<E>,
  opts: DispatchOpts = {},
): Promise<NotifyResult[]> {
  const meta = NOTIFY_EVENT_META[input.event];

  let rowId: string | null = null;
  if (meta.inApp && input.customerId) {
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
    JETONLAR BURADA DOLDURULUR — TEK YERDE (14.16). Sürücü DB bilmez (STACK §4); beş çağıranın
    her birine "jetonu da getir" dedirtmek, birinin unuttuğu gün push'un o olaydan sessizce
    düşmesi demekti. Süzgeç kapının değil servisin: izni kapalı cihaz listeye HİÇ girmez.
    Zile düşmeyen olayda (meta.inApp=false) sorgu hiç atılmaz — push da bir zildir.
  */
  const recipient: NotifyRecipient =
    meta.inApp && input.customerId
      ? {
          ...input.recipient,
          pushTokens: await listSendablePushTokens(db, input.customerId),
          // Dokunuşun adresi — bildirime basan kullanıcı doğru ekrana insin (sürücü künyesi).
          pushData: {
            kind: input.event,
            targetType: input.target?.type ?? null,
            targetId: input.target?.id ?? null,
            payload: input.payload ?? {},
          },
        }
      : input.recipient;

  const results = await (opts.notifier ?? defaultNotifier()).send(input.event, recipient, input.data);

  if (rowId) {
    const deliveries = new NotificationDeliveryService(db);
    for (const result of results) {
      // Teslim kaydı düşerse bildirim düşmez: defter, olgunun kendisinden önemli değildir
      // (zilin "sessizce başarısız olur" kararının aynısı).
      try {
        await deliveries.insert({
          notificationId: rowId,
          channel: result.channel,
          status: result.status,
          reason: result.status === 'skipped' ? result.reason : result.status === 'error' ? result.error : null,
          ref: result.status === 'sent' ? result.ref : null,
        });
      } catch (err) {
        await captureError(err, {
          source: SOURCES.applicationNotification,
          level: 'warning',
          context: { flow: 'notification/dispatch', notificationId: rowId, channel: result.channel },
        });
      }
    }
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
   * Depo-bağlamlı olayda ZORUNLU süzgeç (CLAUDE: depo bir boyut değil, DEĞİŞMEZ): depocu/kurye
   * yalnız kendi deposunun olayını alır. Admin/muhasebe depo-ÜSTÜdür ve süzgeçten muaftır — kapsam
   * kolonları onlar için hiç okunmaz (0001 kararının aynısı). `null` = depo-bağımsız olay.
   */
  warehouseId?: string | null;
  target?: NotificationTargetRef | null;
  payload?: Record<string, unknown>;
  /** Profil BAŞINA tekilleştirilir (0049 kısmi unique) — fan-out'un her satırı kendi anahtarını taşır. */
  dedupeKey?: string | null;
}

/** Depo-üstü roller — kapsam süzgeci onlara uygulanmaz (0001: "admin/muhasebe depo-üstüdür"). */
const WAREHOUSE_EXEMPT: readonly StaffRole[] = ['admin', 'accounting'];

/**
 * **Personele haber ver** — yazarken dağıt (fan-out): uyan her personel için birer satır.
 *
 * Fan-out okuma-anı join'ine bilerek tercih edildi: rozet sayacı her ekran açılışında okunur
 * (sıcak yol) ve satır zaten kişiye ait bir "okundu" hâli taşımak zorunda. Bedeli biliniyor:
 * rolü SONRADAN verilen personel eski bildirimleri görmez — kabul, çünkü bildirim bir AN'dır,
 * arşiv değil; işin kendisi kuyruklarda durur (bildirim ≠ kuyruk).
 *
 * Kanala gitmez: personelin kanalı bugün uygulama içi zildir (push 14.16 ile gelir, e-posta
 * bilerek yok — personel zaten ekranda ve posta kutusu operasyon aracı değil).
 */
export async function dispatchStaffNotification(db: SupabaseClient, input: StaffNotificationInput): Promise<string[]> {
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
  const yazilan: string[] = [];
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
    if (row) yazilan.push(row.id);
  }

  if (yazilan.length > 0) await ringStaffNotificationsBell();
  return yazilan;
}
