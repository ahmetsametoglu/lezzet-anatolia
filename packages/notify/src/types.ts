import type {
  B2bApplicationResultNotification,
  FeedbackInviteNotification,
  OrderNotification,
  PreferredLanguage,
  TicketNotification,
  WebPushSubscription,
  ZoneAvailableNotification,
} from '@lezzet/types';

/**
 * İş kodu kanal bilmez: "müşteriye haber ver" der, hangi kanaldan gideceğine sürücüler karar verir. Sürücü seçimi iş kuralı değil
 * yetenek bakmasıdır; eşik ve izin hesabı çağıranın işidir.
 */

// Cihaz bildirimleri (`push` native, `web_push` tarayıcı) sırada başta durur: HABER tek kanaldan gider ve en ucuz, en hızlı kanal
// kazanmalı. BELGE'de e-postanın yerine geçmez, yanına eklenir.
export type NotifyChannel = 'email' | 'wa_link' | 'whatsapp_api' | 'push' | 'web_push';

/** Cihaz bildirimi kanalları: BELGE'de e-postanın yanına bunlardan biri eklenir. */
export const DEVICE_CHANNELS: readonly NotifyChannel[] = ['push', 'web_push'];

/** Olay adı → o olayın taşıdığı veri. Yeni olay buraya eklenir; sürücüler eksik olayı reddeder. */
export interface NotifyPayloads {
  order_confirmed: OrderNotification;
  order_out_for_delivery: OrderNotification;
  /** Gel-al: mal depoda hazır, müşteri gelip alacak — bu türde "yolda" hiç olmaz, haber budur. */
  order_ready_for_pickup: OrderNotification;
  order_delivered: OrderNotification;
  // İstisna bildirimleri: akışın kesildiği ya da değiştiği anlar.
  order_cancelled: OrderNotification;
  order_shortfall: OrderNotification;
  /** Kart ödemesi hiç gelmeyen taslak iptal edildi: sipariş oluşmadı, numara `—`dır. */
  order_payment_incomplete: OrderNotification;
  order_refunded: OrderNotification;
  // Talep olaylarının veri şekli ayrı, yoksa sürücüler alanın varlığını tahmin ederdi. `ticket_received` haber değil teyittir:
  // müşterinin mesajının bize ulaştığını kanıtlar.
  ticket_received: TicketNotification;
  ticket_replied: TicketNotification;
  ticket_status_changed: TicketNotification;
  /** İstekten değil saatten doğar; yine aynı sürücü listesinden gider ki iki ayrı kanal sırası oluşmasın. */
  feedback_invite: FeedbackInviteNotification;
  /**
   * Tetik bölgenin kaydına değil kodun kapsanmış olmasına bağlı, çünkü kod bölgeye başka yollardan da girebilir ve o yollar haberi
   * sessizce kaçırırdı.
   */
  zone_available: ZoneAvailableNotification;
  b2b_application_result: B2bApplicationResultNotification;
}
export type NotifyEventName = keyof NotifyPayloads;

export interface NotifyRecipient {
  name: string | null;
  email: string | null;
  phone: string | null;
  locale: PreferredLanguage;
  /** Gönderilebilir Expo jetonları; izni kapalı cihaz listeye hiç girmez. Sürücü DB bilmediği için jetonu dağıtım kapısı doldurur. */
  pushTokens?: string[];
  /** Gönderilebilir tarayıcı abonelikleri; dağıtım kapısı native jetonla birlikte doldurmaz, bir haber tek cihaz sınıfına gider. */
  webPush?: WebPushSubscription[];
  /** Bildirime dokununca açılacak yerin adresi (`kind`, hedef, payload); kişisel içerik girmez. */
  pushData?: Record<string, unknown>;
}

/**
 * `skipped` gönderilecek bir şey yoktu demektir (adres ya da sağlayıcı anahtarı yok) ve hata değildir; `error`da çağıran loglar ama
 * işi geri almaz. `gone` taşıyıcının "bu cihaz artık yok" dediği adreslerdir: sürücü DB bilmediği için silmek çağıranın işidir.
 */
export type NotifyResult =
  | { status: 'sent'; channel: NotifyChannel; ref: string | null; gone?: string[] }
  | { status: 'skipped'; channel: NotifyChannel; reason: string }
  | { status: 'error'; channel: NotifyChannel; error: string; gone?: string[] };

export interface NotifyDriver {
  channel: NotifyChannel;
  /** Bu sürücü bu olayı bu alıcıya iletebilir mi (adres/telefon var mı, olay destekleniyor mu). */
  supports<E extends NotifyEventName>(event: E, recipient: NotifyRecipient): boolean;
  send<E extends NotifyEventName>(
    event: E,
    recipient: NotifyRecipient,
    payload: NotifyPayloads[E],
  ): Promise<NotifyResult>;
}

/**
 * `ping` HABERdir: tek kanal yeter, ulaşmazsa uygulama içi satır zaten yazılmıştır. `document` mesafeli satışta dayanıklı ortamda
 * verilmesi gereken BELGEdir: e-posta her zaman denenir, cihaz bildirimi yanına eklenir.
 */
export type NotifyClass = 'ping' | 'document';

export interface NotifyEventMeta {
  class: NotifyClass;
  /** `ticket_received` satır yazmaz: müşterinin kendi eyleminin yankısını zile düşürmek gürültüdür. */
  inApp: boolean;
}

/** `Record` kilittir: `NotifyPayloads`a eklenen olay burada sınıfı seçilmeden derlenmez. */
export const NOTIFY_EVENT_META: Record<NotifyEventName, NotifyEventMeta> = {
  order_confirmed: { class: 'document', inApp: true },
  order_out_for_delivery: { class: 'ping', inApp: true },
  order_ready_for_pickup: { class: 'ping', inApp: true }, // "yolda"nın gel-al karşılığı: tek kanal, en hızlısı
  order_delivered: { class: 'document', inApp: true }, // teslim özeti ve fiş taşır
  order_cancelled: { class: 'document', inApp: true },
  order_shortfall: { class: 'document', inApp: true }, // para etkisi var — tutar değişti
  order_refunded: { class: 'document', inApp: true },
  order_payment_incomplete: { class: 'ping', inApp: false }, // sipariş oluşmadı: belge değil haber, açılacak kayıt yok
  ticket_received: { class: 'ping', inApp: false }, // teyit — satır yazmaz (gerekçe NotifyEventMeta)
  ticket_replied: { class: 'ping', inApp: true },
  ticket_status_changed: { class: 'ping', inApp: true },
  feedback_invite: { class: 'ping', inApp: true },
  zone_available: { class: 'ping', inApp: true }, // satır YALNIZ profili olan alıcıya (kapının işi)
  b2b_application_result: { class: 'document', inApp: true }, // gerekçeli ticari karar
};
