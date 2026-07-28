import type { OrderNotification, PreferredLanguage } from '@lezzet/types';

/**
 * Bildirim sözleşmesi (14.4). **İş kodu kanal bilmez**: "müşteriye haber ver" der, hangi kanaldan
 * gideceğine sürücü karar verir. Yarın WhatsApp API'si eklendiğinde çağıran taraf değişmez.
 *
 * Sürücü seçimi bir İŞ KURALI DEĞİL, bir yeteneğe (capability) bakmadır: e-posta sürücüsü
 * e-postası olana, WhatsApp sürücüsü telefonu olana gönderir. Eşiği/izni hesaplayan bir mantık
 * buraya girmez — o çağıranın (uygulama katmanı) işidir.
 */

export type NotifyChannel = 'email' | 'wa_link' | 'whatsapp_api';

/** Olay adı → o olayın taşıdığı veri. Yeni olay buraya eklenir; sürücüler eksik olayı reddeder. */
export interface NotifyPayloads {
  order_confirmed: OrderNotification;
  order_out_for_delivery: OrderNotification;
  order_delivered: OrderNotification;
  // İstisna bildirimleri: akışın kesildiği ya da değiştiği anlar.
  order_cancelled: OrderNotification;
  order_shortfall: OrderNotification;
  order_refunded: OrderNotification;
}
export type NotifyEventName = keyof NotifyPayloads;

export interface NotifyRecipient {
  name: string | null;
  email: string | null;
  phone: string | null;
  locale: PreferredLanguage;
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
