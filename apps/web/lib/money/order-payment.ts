import { serviceDb } from '@lezzet/database';
import {
  recordOrderPayment as recordOrderPaymentFor,
  recordOrderRefund as recordOrderRefundFor,
  syncOrderPaymentStatus as syncOrderPaymentStatusFor,
  type OrderMovementInput,
  type PaymentOutcome,
} from '@lezzet/application';

/**
 * Siparişin para bağları için köprü: kural `@lezzet/application`ın `order/payment`indedir ve iki kopya ayrışıp kuralı birinde
 * bırakmıştı. Köprü yalnız `serviceDb()`yi enjekte eder ki web'in çağıranları her seferinde yazmasın.
 */

/** Tahsilat — kapıda nakit/kart, havale, kart ödemesi onayı, kurye gün kapanışı. */
export function recordOrderPayment(input: OrderMovementInput): Promise<PaymentOutcome> {
  return recordOrderPaymentFor(serviceDb(), input);
}

/** İade — kısmi karşılama farkı, iptal/iade. */
export function recordOrderRefund(input: OrderMovementInput): Promise<PaymentOutcome> {
  return recordOrderRefundFor(serviceDb(), input);
}

/** Ödeme durumunu yeniden türetip yazar; karşılanan tutar kısmi karşılamada ya da iptalde değişir, tahsilat değişmese bile. */
export function syncOrderPaymentStatus(orderId: string) {
  return syncOrderPaymentStatusFor(serviceDb(), orderId);
}
