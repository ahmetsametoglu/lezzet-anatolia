import { z } from 'zod';

/**
 * Bildirim kaydı, "şu kişiye şu oldu" satırı; giden bildirimin kanal yükleri ayrı dosyada (`contracts/notification.schema.ts`), ad bu
 * yüzden `app-notification`. Satır cümle değil `kind` + `payload` taşır, çünkü cümle okuyanın diliyle kurulur ve payload hedef silinse
 * de cümle kurulabilsin diye dil-bağımsız, kimliksiz küçük veridir.
 */

/**
 * Olay türü: küme burada, DB'de düz text, çünkü her modülle büyüyen küme DB enum'unda her seferinde migration isterdi; tanınmayan türü
 * ekran genel cümleyle çizer. Müşteri türleri `NotifyEventName` ile aynı adları taşır; `ticket_received` yok, çünkü müşterinin kendi
 * eyleminin yankısı zilde gürültüdür.
 */
export const AppNotificationKindEnum = z.enum([
  // ── Müşteri: sipariş yaşam döngüsü ──
  'order_confirmed',
  'order_out_for_delivery',
  'order_ready_for_pickup',
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
  /** Dayanıklı ortam yükümlülüğü olan belge (sipariş onayı gibi) hiçbir kanala ulaşamadı, örneğin e-postasız müşteride; iş insana düşer. */
  'document_undeliverable',
  /* Personel türleri kuyruğun kendisi değil, kuyruğa düşme anının haberidir; üreticileri `notification/staff-events.ts`. */
  /** Müşteri şikâyet/talep açtı — yönetim kuyruğunun kapı zili. */
  'ticket_opened',
  /** Bir varyantın kullanılabilir stoğu eşiğin ALTINA indi (ilk iniş — künye staff-events'te). */
  'stock_low',
  /** Kurye gün kapanışında sayım/tahsilat farkı çıktı — para tarafının kapı zili. */
  'run_close_mismatch',
  /**
   * Sefer kapandı ama durak(lar) sonuçlanmadı: askıda kalanlar sevkiyat masasına düşer ve günü sevkiyatçı seçer, zil yalnız "bak" der.
   * Hedefi web'in askıda şeridi (`/operations/deliveries`).
   */
  'run_close_pending',
  /** Yeni kurumsal başvuru düştü — onay kuyruğunun kapı zili. */
  'b2b_application_received',
  /** Transfer eksik kabul edildi ve kayıp yazıldı; zil gönderen deponun personeline ve yönetime gider, hedefi transfer belgesi (payload'da). */
  'transfer_shortfall',
  /**
   * Transfer fazla kabul edildi ve alan depo fazlayı sayım belgesiyle stoğuna ekledi; zil gönderene gider, çünkü o birim onun defterinde
   * hâlâ durur ve kendi sayımında bulunmalı.
   */
  'transfer_excess',
  /**
   * Müşteri kargo fiyatı alamadı, çünkü ürün ya da depo verimiz eksik (ölçüsüz ya da kutuya sığmayan ürün, kutusuz ya da adressiz depo);
   * düzeltilene kadar o ürün eşik altında kargoyla satılamaz.
   */
  'shipping_data_missing',
]);
export type AppNotificationKind = z.infer<typeof AppNotificationKindEnum>;

/**
 * Personel türleri, saklama süpürmesinin süzgeci: personel satırı fan-out ile kişi başına çoğalır ve görülmüş hâli gürültüdür, müşteri
 * satırı ise geçmiştir ve süpürülmez. Yeni personel türü buraya da girer, yoksa süpürme onu tanımaz ve satırları sonsuza dek birikir.
 */
export const STAFF_NOTIFICATION_KINDS = [
  'document_undeliverable',
  'ticket_opened',
  'stock_low',
  'run_close_mismatch',
  'run_close_pending',
  'b2b_application_received',
  'transfer_shortfall',
  'transfer_excess',
  'shipping_data_missing',
] as const satisfies readonly AppNotificationKind[];

/** "Tıkla, git" hedefinin türü — adres, içerik değil. Yeni hedef türü ekranıyla birlikte gelir. */
export const NotificationTargetTypeEnum = z.enum(['order', 'ticket', 'feedback_request', 'zone_notice', 'customer', 'variant']);
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
 * Teslim defteri: bildirimin olgusu ile kanala teslimi ayrı kayıtlardır, çünkü belge sınıfı birden çok kanala gider ve tek satır birden
 * çok teslim doğurur.
 */
export const NotificationDeliverySchema = z.object({
  id: z.string().uuid(),
  notificationId: z.string().uuid(),
  /** Kanal adı: `NotifyChannel` kümesi (packages/notify) ve `push`; DB'de text. */
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
   * Makbuz: Expo teslimi asenkron söyler, gönderimde dönen bilettir ve tutanak sonradan sorulur. `expired` 24 saatlik pencere kaçtı,
   * `unparseable` ref çözülemedi ve döngüye girmesin diye kapatıldı; `null` henüz sorulmadı.
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
