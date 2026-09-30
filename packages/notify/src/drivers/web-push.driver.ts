import webpush from 'web-push';
import { brand } from '@lezzet/brand';
import type { WebPushSubscription } from '@lezzet/types';
import type { NotifyDriver, NotifyEventName, NotifyPayloads, NotifyRecipient, NotifyResult } from '../types';
import { NOTIFY_EVENT_META } from '../types';
import { MESSAGE } from '../event-copy';

// Gövde aboneliğin iki anahtarıyla şifrelenir, tarayıcının bildirim servisine gider ve service worker gösterir.

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

/** Defterin okuyacağı kadarı: hangi taşıyıcı, hangi kod, taşıyıcının kısa sebebi. Adresin kendisi abonenin kimliğidir, yazılmaz. */
function failureOf(endpoint: string, reason: unknown): string {
  const host = new URL(endpoint).host;
  if (reason instanceof webpush.WebPushError) return `${host} ${reason.statusCode} ${(reason.body || reason.message).slice(0, 120)}`.trim();
  return `${host} ${reason instanceof Error ? reason.message : String(reason)}`;
}

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

/** Tarayıcıya giden mesaj; service worker `{ title, body, url }`u gösterir, `url` dokunuşun açacağı sayfadır. */
export interface WebPushMessage {
  title: string;
  body?: string;
  url: string | null;
}

export async function sendWebPush(
  subscriptions: readonly WebPushSubscription[],
  message: WebPushMessage,
  sendNotification: typeof webpush.sendNotification = webpush.sendNotification,
): Promise<NotifyResult> {
  const vapid = vapidDetails();
  if (subscriptions.length === 0) return { status: 'skipped', channel: 'web_push', reason: 'no_device' };
  if (!vapid) return { status: 'skipped', channel: 'web_push', reason: 'provider_key_absent' };

  const body = JSON.stringify(message);
  const outcomes = await Promise.allSettled(
    subscriptions.map((subscription) => sendNotification(subscription, body, { vapidDetails: vapid, TTL: TTL_SECONDS, timeout: TIMEOUT_MS })),
  );

  const gone: string[] = [];
  const failures: string[] = [];
  let delivered = 0;
  let firstError: string | null = null;
  outcomes.forEach((outcome, i) => {
    if (outcome.status === 'fulfilled') {
      delivered += 1;
      return;
    }
    const reason: unknown = outcome.reason;
    firstError ??= reason instanceof Error ? reason.message : String(reason);
    if (reason instanceof webpush.WebPushError && GONE_STATUS.has(reason.statusCode)) gone.push(subscriptions[i]!.endpoint);
    else failures.push(failureOf(subscriptions[i]!.endpoint, reason));
  });

  // Kısmi kabul `sent`tir: bir tarayıcıya ulaşan haber ulaşmıştır, düşen abonelik `gone` ile silinir. Silinmeyen hata
  // `partial`da kalır, yoksa bir taşıyıcının (ör. Apple) bütün aboneleri öbürü çalıştıkça sessizce bildirimsiz kalır.
  if (delivered === 0) return { status: 'error', channel: 'web_push', error: firstError ?? 'web push gönderilemedi', gone };
  return {
    status: 'sent',
    channel: 'web_push',
    ref: null,
    gone,
    ...(failures.length > 0 ? { partial: `${failures.length}/${subscriptions.length} ${failures.join(' · ')}` } : {}),
  };
}

export function webPushDriver(options: WebPushDriverOptions = {}): NotifyDriver {
  return {
    channel: 'web_push',

    supports(event: NotifyEventName, recipient: NotifyRecipient): boolean {
      return NOTIFY_EVENT_META[event].inApp && (recipient.webPush?.length ?? 0) > 0 && vapidDetails() !== null;
    },

    send(event, recipient, payload): Promise<NotifyResult> {
      const text = recipient.pushText ?? { title: brand.name, body: MESSAGE[event](payload) };
      return sendWebPush(recipient.webPush ?? [], { ...text, url: OPEN_URL[event](payload) }, options.sender);
    },
  };
}
