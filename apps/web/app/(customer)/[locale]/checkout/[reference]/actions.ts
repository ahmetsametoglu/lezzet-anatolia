'use server';

import { cancelPendingOrder, reconcileDraftPayment, resumePendingPayment } from '@lezzet/application';
import { OrderService, serviceDb } from '@lezzet/database';
import { currentCustomerId } from '@/lib/guard';
import { CustomerError, customerErrorKey, type CustomerResult } from '@/lib/customer-error';
import { orderIdOrNull } from '@/lib/order/order-id';
import { webPaymentEffects } from '@/lib/order/transition';
import { revolutCheckoutUrl, revolutPaymentGateway } from '@/lib/revolut';

/**
 * Onay sayfasının "sağlayıcıya sor" eylemi: ödeme olayı gelmediğinde siparişi webhook'la aynı yoldan netleştirir; canlı bağ
 * (`OrderWatch`) birkaç saniyede bir çağırır. Başkasının siparişi "netleşti" cevabı alır, ki canlı bağ sussun ve varlık doğrulanmasın.
 */
export async function verifyPaymentAction(orderId: string): Promise<CustomerResult<{ settled: boolean }>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');
    const id = orderIdOrNull(orderId);
    const db = serviceDb();
    const order = id ? await new OrderService(db).getById(id) : null;
    if (!order || order.customerId !== customerId) return { data: { settled: true }, errorKey: null };

    const outcome = await reconcileDraftPayment(db, order.id, { gateway: revolutPaymentGateway(), effects: webPaymentEffects });
    // Sorulamayan hâllerde de (anahtar yok) sormayı sürdürmenin anlamı yok; tanınmayan sağlayıcı durumunda sorular sürer.
    const settled =
      outcome.status === 'confirmed' ||
      outcome.status === 'cancelled' ||
      (outcome.status === 'skipped' && outcome.reason !== 'unknown_status');
    return { data: { settled }, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/** Ödemeye dönüş: aynı siparişin aynı ödemesinin sayfası döner; ödeme geçmiş, işleniyor ya da sipariş kapanmışsa sayfa yenilenir. */
type ResumeResult = { status: 'payment_required'; orderId: string; checkoutUrl: string } | { status: 'settled' };

export async function resumePaymentAction(orderId: string): Promise<CustomerResult<ResumeResult>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');
    const id = orderIdOrNull(orderId);
    if (!id) throw new CustomerError('not_found');
    const outcome = await resumePendingPayment(
      serviceDb(),
      { orderId: id, customerId },
      { gateway: revolutPaymentGateway(), effects: webPaymentEffects },
    );
    if (outcome.status === 'not_found') throw new CustomerError('not_found');
    if (outcome.status === 'provider_unavailable') throw new CustomerError('payment_unavailable');
    if (outcome.status !== 'payment_required') return { data: { status: 'settled' }, errorKey: null };
    const checkoutUrl = revolutCheckoutUrl(outcome.paymentToken);
    if (!checkoutUrl) throw new CustomerError('payment_unavailable');
    return { data: { status: 'payment_required', orderId: outcome.orderId, checkoutUrl }, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/** Müşteri vazgeçti: ödeme ve sipariş kapanır, kalemler sepete döner. Geçmiş ya da işlenen ödeme iptal edilmez, sayfa yenilenir. */
export async function cancelPendingOrderAction(orderId: string): Promise<CustomerResult<{ cancelled: boolean }>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');
    const id = orderIdOrNull(orderId);
    if (!id) throw new CustomerError('not_found');
    const outcome = await cancelPendingOrder(
      serviceDb(),
      { orderId: id, customerId },
      { gateway: revolutPaymentGateway(), effects: webPaymentEffects },
    );
    if (outcome.status === 'not_found') throw new CustomerError('not_found');
    if (outcome.status === 'provider_unavailable') throw new CustomerError('payment_unavailable');
    return { data: { cancelled: outcome.status === 'cancelled' || outcome.status === 'closed' }, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}
