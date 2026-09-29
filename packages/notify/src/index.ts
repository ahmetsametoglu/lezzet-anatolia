// @lezzet/notify — soyut giden bildirim katmanı (e-posta / wa.me / WhatsApp API / push); sağlayıcı arkadan takılır.
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
// Olay → sınıf (HABER/BELGE) + uygulama içi satır kararı; sınıf bilgisinin tek yeri.
export { NOTIFY_EVENT_META } from './types';
export { createNotifier, defaultNotifier, type Notifier } from './notifier';
export { formatMessageDate } from './format';
export { emailDriver } from './drivers/email.driver';
export { pushDriver, type PushDriverOptions } from './drivers/push.driver';
export { webPushDriver, type WebPushDriverOptions } from './drivers/web-push.driver';
export { waLinkDriver, type WaLinkDriverOptions } from './drivers/wa-link.driver';
export { whatsappApiDriver } from './drivers/whatsapp-api.driver';
// Cloud API istemcisi: gönderimin HTTP yarısı. Sahtesi `@lezzet/notify/testing`de.
export { sendCloudApiMessage, type CloudApiConfig, type CloudApiMessage, type CloudApiResult } from './whatsapp/cloud-api';
