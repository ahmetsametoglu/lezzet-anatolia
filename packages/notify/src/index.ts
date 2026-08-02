// @lezzet/notify — soyut OUTBOUND bildirim katmanı (e-posta / wa.me / WhatsApp API / push).
// Sağlayıcı arkadan takılır. İçerik: docs/build/14-bildirim-email.md
export type {
  NotifyChannel,
  NotifyDriver,
  NotifyEventName,
  NotifyPayloads,
  NotifyRecipient,
  NotifyResult,
} from './types';
export { createNotifier, defaultNotifier, type Notifier } from './notifier';
export { formatMessageDate } from './format';
export { emailDriver } from './drivers/email.driver';
export { waLinkDriver, type WaLinkDriverOptions } from './drivers/wa-link.driver';
export { whatsappApiDriver } from './drivers/whatsapp-api.driver';
