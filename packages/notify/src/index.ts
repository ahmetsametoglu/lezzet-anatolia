// @lezzet/notify — soyut OUTBOUND bildirim katmanı (e-posta / wa.me / WhatsApp API / push).
// Sağlayıcı arkadan takılır. İçerik: docs/build/14-bildirim-email.md
export type {
  NotifyChannel,
  NotifyClass,
  NotifyDriver,
  NotifyEventMeta,
  NotifyEventName,
  NotifyPayloads,
  NotifyRecipient,
  NotifyResult,
} from './types';
// Olay → sınıf (HABER/BELGE) + uygulama-içi satır kararı (14.12) — sınıf bilgisinin TEK yeri.
export { NOTIFY_EVENT_META } from './types';
export { createNotifier, defaultNotifier, type Notifier } from './notifier';
export { formatMessageDate } from './format';
export { emailDriver } from './drivers/email.driver';
export { pushDriver, type PushDriverOptions } from './drivers/push.driver';
export { waLinkDriver, type WaLinkDriverOptions } from './drivers/wa-link.driver';
export { whatsappApiDriver } from './drivers/whatsapp-api.driver';
// Cloud API istemcisi (15.11) — gönderimin HTTP yarısı. Sahtesi `@lezzet/notify/testing`de.
export { sendCloudApiMessage, type CloudApiConfig, type CloudApiMessage, type CloudApiResult } from './whatsapp/cloud-api';
