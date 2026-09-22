import { openPaymentBefore, type OpenPayment } from '@lezzet/application';
import type { Db } from '@lezzet/database';
import { captureError, SOURCES } from '@lezzet/observability';
import { mobilePaymentEffects } from './order-effects';
import { paymentGateway } from './stripe';

/**
 * Müşterinin açık kart ödemesini Stripe'a sorarak netleştirir: geçtiyse sipariş onaylanır ve sepetten düşer. Stripe'ın mesajı
 * gelmese de native'de ödeme sonrası sepet ve sipariş okuması siparişi görsün diye; web'de bu işi ödeme sayfası yapar.
 */
export async function settleOpenPayment(db: Db, customerId: string): Promise<OpenPayment | null> {
  return openPaymentBefore(db, customerId, { gateway: paymentGateway(), effects: mobilePaymentEffects(db) });
}

/** Okuma uçları için: Stripe'a ulaşılamazsa iz bırakılır ve okuma sürer, sepet ya da liste bu yüzden düşmemeli. */
export async function settleOpenPaymentQuietly(db: Db, customerId: string): Promise<void> {
  try {
    await settleOpenPayment(db, customerId);
  } catch (error) {
    await captureError(error, { source: SOURCES.mobileApiHttp, context: { customerId, step: 'settle_open_payment' } });
  }
}
