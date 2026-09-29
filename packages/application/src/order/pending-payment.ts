import { OrderService, type Db } from '@lezzet/database';
import { paymentStateOf } from '@lezzet/domain-core';
import { captureError, SOURCES } from '@lezzet/observability';
import type { DeliveryType, Order } from '@lezzet/types';
import type { ConfirmPaymentDeps } from './confirm-payment';
import { reconcileOrder, type ReconcileOutcome } from './reconcile-payment';

/*
  Ödemesi yarım kalan kart siparişi yeni taslak açılmadan aynı siparişle sürer: müşteri aynı ödemeye döner ya da siparişi iptal
  eder. Kalemler ödeme açılırken sepetten siparişe geçtiği için iki kapı da siparişin kendisiyle çalışır.
*/

/** Ödeme beklemeyen siparişin hâli: `paid` ödeme geçti ve sipariş onaylandı, `processing` banka işliyor. */
export type PendingPaymentSettled = { status: 'paid' | 'processing' | 'closed'; orderId: string };

export type ResumePaymentOutcome =
  /** Ödeme hâlâ alınabilir; aynı ödemenin anahtarı döner, ikinci ödeme doğmaz. */
  | { status: 'payment_required'; orderId: string; totalCents: number; deliveryType: DeliveryType; clientSecret: string }
  | PendingPaymentSettled
  | { status: 'not_found' }
  /** Sağlayıcıya sorulamadı; "ödenmedi" sayılmaz. */
  | { status: 'provider_unavailable' };

export type CancelPendingOutcome =
  { status: 'cancelled'; orderId: string } | PendingPaymentSettled | { status: 'not_found' } | { status: 'provider_unavailable' };

interface PendingOrderInput {
  orderId: string;
  /** Sunucuda çözülmüş müşteri; başkasının siparişi bulunamayan gibi cevaplanır. */
  customerId: string;
}

export async function resumePendingPayment(db: Db, input: PendingOrderInput, deps: ConfirmPaymentDeps): Promise<ResumePaymentOutcome> {
  const order = await ownOrder(db, input);
  return order ? resumeOrderPayment(db, order, deps) : { status: 'not_found' };
}

/** Sağlayıcıya sorar: ödeme geçtiyse onaylar, pencere kapandıysa kapatır, hâlâ alınabiliyorsa aynı ödemeyi geri verir. */
export async function resumeOrderPayment(db: Db, order: Order, deps: ConfirmPaymentDeps): Promise<ResumePaymentOutcome> {
  const settled = await reconcileOrder(db, order, deps);
  if (settled.status !== 'waiting') return settledOutcome(order, settled);
  if (paymentStateOf(settled.payment.status) === 'processing') return { status: 'processing', orderId: order.id };
  if (!settled.payment.clientSecret) return { status: 'provider_unavailable' };
  return {
    status: 'payment_required',
    orderId: order.id,
    totalCents: order.orderedTotalCents,
    deliveryType: order.deliveryType,
    clientSecret: settled.payment.clientSecret,
  };
}

/** Müşteri vazgeçti: ödeme ve sipariş kapanır, kalemler sepete döner. Geçmiş ya da bankada işlenen ödeme iptal edilmez. */
export async function cancelPendingOrder(db: Db, input: PendingOrderInput, deps: ConfirmPaymentDeps): Promise<CancelPendingOutcome> {
  const order = await ownOrder(db, input);
  if (!order) return { status: 'not_found' };
  const settled = await reconcileOrder(db, order, deps, { cancelledByCustomer: true });
  if (settled.status === 'cancelled') return { status: 'cancelled', orderId: order.id };
  if (settled.status === 'waiting') return { status: 'processing', orderId: order.id };
  return settledOutcome(order, settled);
}

/**
 * Müşterinin ödemesi beklenen siparişlerini sağlayıcıya sorar, ki liste ödeme mesajı gelmese de sonucu görsün. Satırlar
 * bağımsızdır; biri düşerse iz bırakılır ve okuma sürer.
 */
export async function settlePendingPayments(db: Db, customerId: string, deps: ConfirmPaymentDeps): Promise<void> {
  if (!deps.gateway) return;
  for (const order of await new OrderService(db).listOpenOnlineDrafts({ customerId })) {
    try {
      await reconcileOrder(db, order, deps);
    } catch (error) {
      await captureError(error, { source: SOURCES.applicationOrder, context: { flow: 'settle_pending_payments', orderId: order.id } });
    }
  }
}

async function ownOrder(db: Db, input: PendingOrderInput): Promise<Order | null> {
  const order = await new OrderService(db).getById(input.orderId);
  return order && order.customerId === input.customerId ? order : null;
}

function settledOutcome(
  order: Order,
  settled: Exclude<ReconcileOutcome, { status: 'waiting' }>,
): PendingPaymentSettled | { status: 'provider_unavailable' } {
  if (settled.status !== 'skipped') return { status: settled.status === 'confirmed' ? 'paid' : 'closed', orderId: order.id };
  if (settled.reason !== 'not_open') return { status: 'provider_unavailable' };
  // Kart taslağı değil: iptal edilmiş ya da kart dışı sipariş ödeme beklemez, onaylanmış kart siparişinin parası alınmıştır.
  const paid = order.status !== 'cancelled' && order.status !== 'draft' && order.paymentMethod === 'online';
  return { status: paid ? 'paid' : 'closed', orderId: order.id };
}
