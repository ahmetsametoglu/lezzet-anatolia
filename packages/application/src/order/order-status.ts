import { OrderService, type Db } from '@lezzet/database';
import { isRefundedCancellation, orderOutcomeOf, paymentStateOf, type CardPaymentState } from '@lezzet/domain-core';
import type { CheckoutOrderStatus } from '@lezzet/types';
import type { ConfirmPaymentDeps } from './confirm-payment';
import { paymentDeadlineOf } from './pending-payment';
import { reconcileOrder } from './reconcile-payment';
import { orderChannelName } from '../realtime/order-channel';

/**
 * Kart beklenirken önce sağlayıcıya sorar ve siparişi webhook'la aynı yoldan netleştirir; ödeme mesajı gelmese de ekran sonucu
 * görür. Başkasının siparişi bulunamamış gibi `null` döner.
 */
export async function readCheckoutOrderStatus(
  db: Db,
  input: { orderId: string; customerId: string },
  deps: ConfirmPaymentDeps,
): Promise<CheckoutOrderStatus | null> {
  const orders = new OrderService(db);
  let order = await orders.getById(input.orderId);
  if (!order || order.customerId !== input.customerId) return null;

  let paymentState: CardPaymentState | null = null;
  if (orderOutcomeOf(order).awaitingCard) {
    const settled = await reconcileOrder(db, order, deps);
    if (settled.status === 'waiting') paymentState = paymentStateOf(settled.payment.status);
    order = (await orders.getById(order.id)) ?? order;
  }

  const outcome = orderOutcomeOf(order);
  return {
    ...outcome,
    refunded: isRefundedCancellation({ cancelled: outcome.cancelled, refundedAt: order.providerRefundedAt }),
    paymentState: outcome.awaitingCard ? paymentState : null,
    payBy: outcome.awaitingCard ? await paymentDeadlineOf(db, order.id) : null,
    referenceNo: order.referenceNo,
    channel: orderChannelName(order.id),
    totalCents: order.orderedTotalCents,
    deliveryType: order.deliveryType,
    deliveryDate: order.deliveryDate,
  };
}
