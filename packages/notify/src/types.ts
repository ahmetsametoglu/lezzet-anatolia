import type {
  B2bApplicationResultNotification,
  FeedbackInviteNotification,
  OrderNotification,
  PreferredLanguage,
  TicketNotification,
  ZoneAvailableNotification,
} from '@lezzet/types';

/**
 * Bildirim sözleşmesi (14.4). **İş kodu kanal bilmez**: "müşteriye haber ver" der, hangi kanaldan
 * gideceğine sürücü karar verir. Yarın WhatsApp API'si eklendiğinde çağıran taraf değişmez.
 *
 * Sürücü seçimi bir İŞ KURALI DEĞİL, bir yeteneğe (capability) bakmadır: e-posta sürücüsü
 * e-postası olana, WhatsApp sürücüsü telefonu olana gönderir. Eşiği/izni hesaplayan bir mantık
 * buraya girmez — o çağıranın (uygulama katmanı) işidir.
 */

// `push` 14.16 ile geldi: Expo cihaz bildirimi. Kanal sırasında BAŞTA durur (HABER tek kanaldır
// ve en ucuz/en hızlı kanal kazanır); BELGE'de e-postanın YERİNE GEÇMEZ, ilave gider (meta planı).
export type NotifyChannel = 'email' | 'wa_link' | 'whatsapp_api' | 'push';

/** Olay adı → o olayın taşıdığı veri. Yeni olay buraya eklenir; sürücüler eksik olayı reddeder. */
export interface NotifyPayloads {
  order_confirmed: OrderNotification;
  order_out_for_delivery: OrderNotification;
  order_delivered: OrderNotification;
  // İstisna bildirimleri: akışın kesildiği ya da değiştiği anlar.
  order_cancelled: OrderNotification;
  order_shortfall: OrderNotification;
  order_refunded: OrderNotification;
  // Talep bildirimleri (14.7 · 16.4) — olay başına ayrı veri şekli; hepsi `OrderNotification`
  // olsaydı sürücüler "bu payload'da referenceNo var mı" diye tahmin etmek zorunda kalırdı.
  //
  // `ticket_received` bu ailenin İSTİSNASIDIR: müşterinin kendi eylemi haber doğurur. Kural
  // ("kimse kendi cümlesini mailde okumak istemez") bir BİLDİRİM kuralıdır; bu ise bir TEYİTTİR —
  // işi müşteriye bir şey anlatmak değil, mesajın bize ulaştığını kanıtlamak. Ekran zaten söz
  // veriyordu ("aldığımızda ve yanıtladığımızda haber veririz") ve olay yoktu.
  ticket_received: TicketNotification;
  ticket_replied: TicketNotification;
  ticket_status_changed: TicketNotification;
  /**
   * Alım-sonrası değerlendirme daveti (17.2). Bu ailenin İKİNCİ istisnası: yukarıdakilerin hepsini
   * bir istek doğurur (durum değişti, müşteri yazdı), bunu ise SAAT doğurur — `apps/backend`'in
   * günlük taraması. Sözleşme açısından farkı yok ve olmamalı: aynı sürücü listesi, aynı yetenek
   * bakması. Zamanlı işin kendi gönderim yolunu açması, bir gün iki farklı kanal sırası demekti.
   */
  feedback_invite: FeedbackInviteNotification;
  /**
   * **Müşterinin BEKLEDİĞİ bir şey oldu ve ona söylenmesi gerekiyor** (14.10) — iki olay, aynı
   * boşluk sınıfı.
   *
   * `zone_available` bu ailenin ÜÇÜNCÜ zamanlı olayıdır (`feedback_invite` gibi bir işten doğar),
   * ama farkı şu: onu bir saat değil bir **DURUM** doğuruyor — kod kapsanmış hâle geldi. Tetik
   * bölgenin kaydedilmesine bağlanmadı; bir kod bölgeye migration'la, elle SQL'le ya da bugün
   * olmayan ikinci bir ekrandan da girebilir ve o yolların hiçbiri tetiği çalıştırmazdı. Kaçan
   * gönderim hata vermez, yalnız müşteri hiç haber almaz.
   *
   * `b2b_application_result` ise bir KARARDAN doğar. Gerekçe veride zorunlu ve üç dile çevriliyordu
   * ama hiçbir okuyucuya ulaşmıyordu — künye "e-postayla gidiyor" diyordu, şablon hiç yazılmamıştı.
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
  /**
   * Gönderilebilir Expo jetonları (14.16) — tek kapı doldurur (`dispatch`, `listSendablePushTokens`:
   * izni kapalı cihaz LİSTEYE HİÇ GİRMEZ). Sürücü DB bilmez; jeton buradan gelir (STACK §4).
   * Opsiyonel: mevcut alıcı kurucuları değişmedi, jetonsuz alıcıda push sürücüsü yeteneksizdir.
   */
  pushTokens?: string[];
  /**
   * Push bildiriminin `data` yükü (14.16) — DOKUNUŞUN adresi: `{ kind, targetType, targetId,
   * payload }`. Tek kapı kurar (satırın kendisinden), sürücü olduğu gibi taşır; uygulama dokunuşta
   * okuyup ekrana yönlendirir. Kişisel içerik girmez — satır payload'unun aynı disiplini.
   */
  pushData?: Record<string, unknown>;
}

/**
 * Üç sonuç ayrıdır ve karıştırılmaz:
 * - `sent` — gerçekten gitti.
 * - `skipped` — gönderilecek bir şey yoktu (adres yok, sağlayıcı anahtarı yok). **Hata değildir**;
 *   yerelde anahtarsız çalışırken her akışın kırmızı yanması işe yaramaz.
 * - `error` — gitmesi gerekiyordu, gidemedi. Çağıran loglar ama işi geri almaz: sipariş kaydedilmişken
 *   mail yüzünden iptal etmek yanlış olurdu.
 */
export type NotifyResult =
  | { status: 'sent'; channel: NotifyChannel; ref: string | null }
  | { status: 'skipped'; channel: NotifyChannel; reason: string }
  | { status: 'error'; channel: NotifyChannel; error: string };

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
 * **Olay sınıfı** (14.12) — teslim güvencesini belirler, kanalı değil.
 *
 * `ping`     → HABER: tek kanaldan gitmesi yeter (aynı haberi iki kez almak gürültüdür) ve
 *              ulaşamazsa dünyanın sonu değildir — uygulama içi satır zaten yazılmıştır.
 * `document` → BELGE: mesafeli satışta DAYANIKLI ORTAMDA verilmesi gereken kayıt (sipariş onayı,
 *              iade). E-posta HER ZAMAN denenir; push bir gün eklendiğinde İLAVE gider, yerine
 *              geçmez. E-postasız müşteride belge kanalsız kalır — o hâl sessiz geçilmez,
 *              operasyona düşer (`document_undeliverable`, tek kapının işi).
 */
export type NotifyClass = 'ping' | 'document';

export interface NotifyEventMeta {
  class: NotifyClass;
  /**
   * Uygulama içi bildirim SATIRI yazılır mı (14.12). Çoğu olayda evet; `ticket_received` hayır —
   * o bir TEYİTTİR (yukarıdaki künyesi: "işi müşteriye bir şey anlatmak değil, mesajın ulaştığını
   * kanıtlamak") ve müşterinin kendi eyleminin yankısını zile düşürmek gürültüdür.
   */
  inApp: boolean;
}

/**
 * Olay → sınıf + satır kararı. `Record` KİLİTTİR: `NotifyPayloads`a eklenen olay burada karar
 * verilmeden derlenmez — "yeni olay hangi sınıfta" sorusu sessizce atlanamaz (CLAUDE §1: sınıf
 * bilgisi TEK yerde; uygulama katmanında if/else olarak ikinci kez yazılmaz).
 */
export const NOTIFY_EVENT_META: Record<NotifyEventName, NotifyEventMeta> = {
  order_confirmed: { class: 'document', inApp: true },
  order_out_for_delivery: { class: 'ping', inApp: true },
  order_delivered: { class: 'document', inApp: true }, // teslim özeti/fiş taşır (14.6'nın zemini)
  order_cancelled: { class: 'document', inApp: true },
  order_shortfall: { class: 'document', inApp: true }, // para etkisi var — tutar değişti
  order_refunded: { class: 'document', inApp: true },
  ticket_received: { class: 'ping', inApp: false }, // teyit — satır yazmaz (gerekçe NotifyEventMeta)
  ticket_replied: { class: 'ping', inApp: true },
  ticket_status_changed: { class: 'ping', inApp: true },
  feedback_invite: { class: 'ping', inApp: true },
  zone_available: { class: 'ping', inApp: true }, // satır YALNIZ profili olan alıcıya (kapının işi)
  b2b_application_result: { class: 'document', inApp: true }, // gerekçeli ticari karar
};
