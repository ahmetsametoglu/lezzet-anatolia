import { settlePendingPayments } from '@lezzet/application';
import type { Db } from '@lezzet/database';
import { captureError, SOURCES } from '@lezzet/observability';
import { mobilePaymentEffects } from './order-effects';
import { paymentGateway } from './stripe';

/**
 * Müşterinin ödemesi beklenen siparişleri Stripe'a sorulur, ki liste Stripe'ın mesajı gelmese de sonucu görsün. Stripe'a
 * ulaşılamazsa iz bırakılır ve okuma sürer; liste bu yüzden düşmemeli.
 */
export async function settlePendingPaymentsQuietly(db: Db, customerId: string): Promise<void> {
  try {
    await settlePendingPayments(db, customerId, { gateway: paymentGateway(), effects: mobilePaymentEffects(db) });
  } catch (error) {
    await captureError(error, { source: SOURCES.mobileApiHttp, context: { customerId, step: 'settle_pending_payments' } });
  }
}
