import { registerWebPushAction, removeWebPushAction } from '@/lib/push/actions';
import type { WebPushSurface } from '@/lib/push/web-push-client';

/** Müşteri sitesinin kaydı `customer` uygulamasına yazılır; sipariş ve talep haberi bu satırı okur. */
export const customerWebPush: WebPushSurface = {
  register: async (subscription) => (await registerWebPushAction(subscription)).data === true,
  remove: async (endpoint) => (await removeWebPushAction(endpoint)).data === true,
};
