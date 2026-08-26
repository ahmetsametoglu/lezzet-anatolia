import { z } from 'zod';

/**
 * **Bildirim KAYDI** (14.12, migration 0049) — "şu kişiye şu oldu" satırı.
 *
 * Dosya adı `app-notification` çünkü `contracts/notification.schema.ts` başka bir şeyin adı:
 * orada GİDEN bildirimin kanal yükleri yaşıyor (`OrderNotification` = maile giren veri). Bu ise
 * kalıcı KAYIT — uygulama içi zilin, okundu/gizlendi hâlinin ve teslim defterinin öznesi. İkisini
 * tek dosyada toplamak, "notification" kelimesinin iki ayrı anlamını tek ada sıkıştırmak olurdu.
 *
 * ── METİN YOK, VERİ VAR ─────────────────────────────────────────────────────
 * Satır cümle taşımaz (dil müşterinin tercihine bağlı ve değişebilir); `kind` + `payload` taşır,
 * cümleyi okuyan yüzey kurar. `payload` dil-bağımsız ve KİMLİKSİZ küçük veridir (referenceNo,
 * postalCode) — hedefe N+1 okuma yapmadan ve hedef silinse bile cümle kurulabilsin diye.
 */

/**
 * Olay türü — kaynağı BU enum, DB'de düz text (0049 künyesi: her modülle büyüyen küme DB
 * enum'unda her seferinde migration isterdi; yanlış değeri Zod reddeder, ekran bilinmeyen türe
 * genel cümleyle düşer).
 *
 * Müşteri türleri `NotifyEventName` ile AYNI adları taşır (bilerek — iki sözlük eşlenmez, bir
 * sözlük paylaşılır). `ticket_received` LİSTEDE YOK: o bir teyittir, müşterinin kendi eyleminin
 * yankısını zile düşürmek gürültüdür (karşı-inceleme 11).
 */
export const AppNotificationKindEnum = z.enum([
  // ── Müşteri: sipariş yaşam döngüsü ──
  'order_confirmed',
  'order_out_for_delivery',
  'order_delivered',
  'order_cancelled',
  'order_shortfall',
  'order_refunded',
  // ── Müşteri: talep ──
  'ticket_replied',
  'ticket_status_changed',
  // ── Müşteri: sadakat ve hesap ──
  'feedback_invite',
  'zone_available',
  'b2b_application_result',
  // ── Personel ──
  /**
   * Ulaştırılamayan BELGE (karşı-inceleme 2 + ölçüm): e-postasız müşterinin sipariş onayı bugün
   * `wa_link` "sent" raporlayıp HİÇBİR YERE gitmiyordu (üretimde `onLink` boş). Dayanıklı ortam
   * yükümlülüğü olan belge hiçbir kanala ulaşamadıysa iş İNSANA düşer — bu tür o düşüşün satırı.
   */
  'document_undeliverable',
]);
export type AppNotificationKind = z.infer<typeof AppNotificationKindEnum>;

/** "Tıkla, git" hedefinin türü — adres, içerik değil. Yeni hedef türü ekranıyla birlikte gelir. */
export const NotificationTargetTypeEnum = z.enum(['order', 'ticket', 'feedback_request', 'zone_notice', 'customer']);
export type NotificationTargetType = z.infer<typeof NotificationTargetTypeEnum>;

export const AppNotificationSchema = z.object({
  id: z.string().uuid(),
  /** Alıcı — müşteri de personel de (kimlik tek tabloda, rol ayırır). */
  profileId: z.string().uuid(),
  kind: AppNotificationKindEnum,
  targetType: NotificationTargetTypeEnum.nullable(),
  targetId: z.string().uuid().nullable(),
  /**
   * Depo boyutu — depo-bağlamlı PERSONEL olayının süzgeci (CLAUDE: depo bir boyut değil,
   * değişmez). Müşteri olaylarında ve depo-üstü olaylarda null.
   */
  warehouseId: z.string().uuid().nullable(),
  /** Dil-bağımsız, kimliksiz küçük veri — serbest metin ve kişisel içerik GİRMEZ. */
  payload: z.record(z.unknown()),
  /** Formülü OLAY tanımlar; istisna olaylarında null (her düzeltme ayrı haber). */
  dedupeKey: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }),
  readAt: z.string().datetime({ offset: true }).nullable(),
  /** Gizlendi — okundudan AYRI: rozet sayacı ikisine birden bakar (tanım tek yerde, application). */
  dismissedAt: z.string().datetime({ offset: true }).nullable(),
});
export type AppNotification = z.infer<typeof AppNotificationSchema>;

export const AppNotificationInsertSchema = AppNotificationSchema.pick({
  profileId: true,
  kind: true,
}).extend(
  AppNotificationSchema.pick({ targetType: true, targetId: true, warehouseId: true, payload: true, dedupeKey: true }).partial()
    .shape,
);
export type AppNotificationInsert = z.infer<typeof AppNotificationInsertSchema>;

/** Güncellenebilen tek şey okuma hâlidir — olay geçmişi değiştirilemez. */
export const AppNotificationUpdateSchema = AppNotificationSchema.pick({ id: true }).extend(
  AppNotificationSchema.pick({ readAt: true, dismissedAt: true }).partial().shape,
);
export type AppNotificationUpdate = z.infer<typeof AppNotificationUpdateSchema>;

/**
 * **Teslim defteri** (0049) — bildirim OLGUsu ile kanala TESLİMİ ayrı kayıtlardır: BELGE sınıfı
 * "e-posta her zaman + push da" der, tek satır birden çok teslim doğurur; notifier zaten
 * `NotifyResult[]` (dizi) döndürüyordu ve tek kolon o diziyi ezerdi.
 */
export const NotificationDeliverySchema = z.object({
  id: z.string().uuid(),
  notificationId: z.string().uuid(),
  /** Kanal adı — küme `NotifyChannel`dan (packages/notify) + ileride `push`; DB'de text. */
  channel: z.string(),
  /** NotifyResult'ın üçlüsü, olduğu gibi. */
  status: z.enum(['sent', 'skipped', 'error']),
  /** skipped/error sebebi; sent'te null. */
  reason: z.string().nullable(),
  /**
   * Sağlayıcı referansı — "gerçekten ne gitti"nin izi. Push'ta JSON eşleme
   * (`[{token, ticket}]`): makbuz turu hangi biletin hangi cihaza ait olduğunu bilmek zorunda.
   */
  ref: z.string().nullable(),
  /**
   * Makbuz (14.16) — Expo teslimi ASENKRON söyler: gönderimde dönen BİLETTİR, teslim tutanağı
   * sonradan sorulur. `ok` · `error` · `expired` (24 saatlik makbuz penceresi kaçtı) ·
   * `unparseable` (ref çözülemedi — döngüye girmesin diye kapatıldı). `null` = henüz sorulmadı.
   */
  receiptStatus: z.string().nullable(),
  receiptCheckedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
});
export type NotificationDelivery = z.infer<typeof NotificationDeliverySchema>;

/** Teslim satırının değişebilen TEK yüzü makbuzdur — gönderim gerçeği donuk kalır. */
export const NotificationDeliveryUpdateSchema = NotificationDeliverySchema.pick({ id: true }).extend(
  NotificationDeliverySchema.pick({ receiptStatus: true, receiptCheckedAt: true }).partial().shape,
);
export type NotificationDeliveryUpdate = z.infer<typeof NotificationDeliveryUpdateSchema>;

export const NotificationDeliveryInsertSchema = NotificationDeliverySchema.pick({
  notificationId: true,
  channel: true,
  status: true,
}).extend(NotificationDeliverySchema.pick({ reason: true, ref: true }).partial().shape);
export type NotificationDeliveryInsert = z.infer<typeof NotificationDeliveryInsertSchema>;
