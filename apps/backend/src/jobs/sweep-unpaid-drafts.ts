import {
  notifyOrderException,
  notifyOrderStatus,
  revolutClient,
  revolutConfigFromEnv,
  revolutGateway,
  sweepUnpaidDrafts,
  type OrderEffects,
} from '@lezzet/application';
import { serviceDb } from '@lezzet/database';

export const SWEEP_UNPAID_DRAFTS = 'sweep_unpaid_drafts';

/**
 * Webhook gelmese de taslak süresiz "onaylanıyor"da kalmasın diye penceresi kapanmış kart taslaklarını sağlayıcıya sorar ve
 * onaylar, bekler ya da kapatır. Anahtar yoksa tur sormadan biter, çünkü sorulamayan taslak "ödenmedi" sayılmaz.
 */
export async function sweepUnpaidDraftsJob(): Promise<Record<string, unknown>> {
  const config = revolutConfigFromEnv();
  const gateway = revolutGateway(config ? revolutClient(config) : null);
  if (!gateway) return { skipped: 'no_provider_key' };

  const db = serviceDb();
  // Onayda sipariş haberi, ödeme geldiğinde mal kalmadıysa iptal haberi — web'in webhook'uyla aynı iki etki.
  const effects: OrderEffects = {
    notifyStatus: (orderId, status) => notifyOrderStatus(db, orderId, status),
    notifyException: (orderId, event, opts) => notifyOrderException(db, orderId, event, opts),
  };
  return sweepUnpaidDrafts(db, { gateway, effects });
}
