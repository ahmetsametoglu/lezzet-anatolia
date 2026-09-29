import webpush from 'web-push';
import { brand } from '@lezzet/brand';
import type { NotifyDriver, NotifyEventName, NotifyPayloads, NotifyRecipient, NotifyResult } from '../types';
import { NOTIFY_EVENT_META } from '../types';
import { MESSAGE } from '../event-copy';

/*
  Gövde aboneliğin iki anahtarıyla şifrelenir, tarayıcının bildirim servisine gider ve service worker gösterir. Başlık marka adıdır:
  tarayıcı bildirimi başlıksız gösterilmez ve native'de işletim sisteminin bastığı uygulama adının karşılığı budur.
*/

/** Cihaz çevrimdışıysa servis haberi bu kadar tutar; bir günden eski sipariş haberi artık haber değildir. */
const TTL_SECONDS = 24 * 60 * 60;

/** Yanıt vermeyen servis, sipariş eylemini bekleten dağıtımı da bekletirdi. */
const TIMEOUT_MS = 10_000;

/** Taşıyıcının "bu abonelik artık yok" cevapları. */
const GONE_STATUS = new Set([404, 410]);

/** Bildirime dokunan müşteri olayın kendi sayfasına gelsin; adres olay yükünde zaten müşterinin dilinde kurulu. */
const OPEN_URL: { [E in NotifyEventName]: (data: NotifyPayloads[E]) => string } = {
  order_confirmed: (d) => d.orderUrl,
  order_out_for_delivery: (d) => d.orderUrl,
  order_ready_for_pickup: (d) => d.orderUrl,
  order_delivered: (d) => d.orderUrl,
  order_cancelled: (d) => d.orderUrl,
  order_shortfall: (d) => d.orderUrl,
  order_payment_incomplete: (d) => d.orderUrl,
  order_refunded: (d) => d.orderUrl,
  ticket_received: (d) => d.ticketUrl,
  ticket_replied: (d) => d.ticketUrl,
  ticket_status_changed: (d) => d.ticketUrl,
  feedback_invite: (d) => d.feedbackUrl,
  zone_available: (d) => d.catalogUrl,
  b2b_application_result: (d) => d.actionUrl,
};

export interface WebPushDriverOptions {
  /** Test enjeksiyonu: ağ yerine sahte gönderici. */
  sender?: typeof webpush.sendNotification;
}

/** Anahtar yoksa sürücü yeteneksizdir; `skipped` dönseydi HABER tek kanal seçtiği için müşteriye hiçbir şey gitmezdi. */
function vapidDetails(): (webpush.VapidKeys & { subject: string }) | null {
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { subject: `mailto:${brand.contact.email}`, publicKey, privateKey };
}

export function webPushDriver(options: WebPushDriverOptions = {}): NotifyDriver {
  const sendNotification = options.sender ?? webpush.sendNotification;
  return {
    channel: 'web_push',

    supports(event: NotifyEventName, recipient: NotifyRecipient): boolean {
      return NOTIFY_EVENT_META[event].inApp && (recipient.webPush?.length ?? 0) > 0 && vapidDetails() !== null;
    },

    async send(event, recipient, payload): Promise<NotifyResult> {
      const subscriptions = recipient.webPush ?? [];
      const vapid = vapidDetails();
      if (subscriptions.length === 0) return { status: 'skipped', channel: 'web_push', reason: 'no_device' };
      if (!vapid) return { status: 'skipped', channel: 'web_push', reason: 'provider_key_absent' };

      const body = JSON.stringify({ title: brand.name, body: MESSAGE[event](payload), url: OPEN_URL[event](payload) });
      const outcomes = await Promise.allSettled(
        subscriptions.map((subscription) => sendNotification(subscription, body, { vapidDetails: vapid, TTL: TTL_SECONDS, timeout: TIMEOUT_MS })),
      );

      const gone: string[] = [];
      let delivered = 0;
      let firstError: string | null = null;
      outcomes.forEach((outcome, i) => {
        if (outcome.status === 'fulfilled') {
          delivered += 1;
          return;
        }
        const reason: unknown = outcome.reason;
        if (reason instanceof webpush.WebPushError && GONE_STATUS.has(reason.statusCode)) gone.push(subscriptions[i]!.endpoint);
        firstError ??= reason instanceof Error ? reason.message : String(reason);
      });

      // Kısmi kabul `sent`tir: bir tarayıcıya ulaşan haber ulaşmıştır, düşen abonelik `gone` ile silinir.
      if (delivered === 0) return { status: 'error', channel: 'web_push', error: firstError ?? 'web push gönderilemedi', gone };
      return { status: 'sent', channel: 'web_push', ref: null, gone };
    },
  };
}
