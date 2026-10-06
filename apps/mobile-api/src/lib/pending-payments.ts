import { settlePendingPayments } from '@lezzet/application';
import type { Db } from '@lezzet/database';
import { captureError, SOURCES } from '@lezzet/observability';
import { mobilePaymentEffects } from './order-effects';
import { paymentGateway } from './revolut';

/**
 * Müşterinin ödemesi beklenen siparişleri sağlayıcıya sorulur, ki liste webhook gelmese de sonucu görsün. Sağlayıcıya ulaşılamazsa
 * iz bırakılır ve okuma sürer; liste bu yüzden düşmemeli.
 */
export async function settlePendingPaymentsQuietly(db: Db, customerId: string): Promise<void> {
  try {
    await settlePendingPayments(db, customerId, { gateway: paymentGateway(), effects: mobilePaymentEffects(db) });
  } catch (error) {
    await captureError(error, { source: SOURCES.mobileApiHttp, context: { customerId, step: 'settle_pending_payments' } });
  }
}
