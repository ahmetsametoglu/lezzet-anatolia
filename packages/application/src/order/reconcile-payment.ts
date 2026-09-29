import { OrderService, ReservationService, type Db } from '@lezzet/database';
import { decideDraftPayment } from '@lezzet/domain-core';
import { captureError, SOURCES } from '@lezzet/observability';
import type { Order } from '@lezzet/types';
import { restoreOrderedLines } from '../cart/settle';
import { ringBell } from '../realtime/bell';
import { orderChannelName } from '../realtime/order-channel';
import { confirmOnlinePayment, type ConfirmPaymentDeps } from './confirm-payment';
import { notifyExceptionEffect } from './effects';
import type { PaymentSnapshot } from './payment-gateway';

/**
 * Ödemesi beklenen kart taslağını sağlayıcının cevabına göre netleştirir: ödendiyse onaylar, banka işliyorsa bekler, ödeme
 * gelmeyecekse ödemeyi ve taslağı iptal eder. Webhook yalnız hızlandırıcıdır; gelmezse onay sayfası ve zamanlayıcı buradan sorar.
 */

export type ReconcileOutcome =
  | { status: 'confirmed' | 'cancelled'; payment: PaymentSnapshot }
  /** Karar yok: banka işliyor ya da ödeme penceresi hâlâ açık. */
  | { status: 'waiting'; payment: PaymentSnapshot }
  | { status: 'skipped'; reason: 'not_found' | 'not_open' | 'no_payment_ref' | 'provider_unavailable' | 'unknown_status' | 'foreign_payment' };

export interface ReconcileOptions {
  /** Müşteri kendi siparişini iptal ediyor: pencere beklenmez, sebep `customer` olur ve "sipariş oluşmadı" haberi gitmez. */
  cancelledByCustomer?: boolean;
}

export async function reconcileDraftPayment(db: Db, orderId: string, deps: ConfirmPaymentDeps): Promise<ReconcileOutcome> {
  const order = await new OrderService(db).getById(orderId);
  if (!order) return { status: 'skipped', reason: 'not_found' };
  return reconcileOrder(db, order, deps);
}

/** Sipariş satırı çağıranda okunmuşsa ikinci kez sorulmaz; sahiplik denetimi çağıranın işidir. */
export async function reconcileOrder(
  db: Db,
  order: Order,
  deps: ConfirmPaymentDeps,
  opts: ReconcileOptions = {},
): Promise<ReconcileOutcome> {
  const orders = new OrderService(db);
  // Yalnız ödemesi beklenen kart taslağı: onaylanmış ya da iptal edilmiş siparişte sorulacak bir şey yok.
  if (order.status !== 'draft' || order.paymentMethod !== 'online') return { status: 'skipped', reason: 'not_open' };
  if (!order.paymentRef) return { status: 'skipped', reason: 'no_payment_ref' };
  // Anahtarsız ortam: sorulamıyor. "Ödenmedi" SAYILMAZ — bilinmeyen, bir değere düşürülmez (CLAUDE §1).
  if (!deps.gateway) return { status: 'skipped', reason: 'provider_unavailable' };

  const payment = await deps.gateway.read(order.paymentRef);
  if (!payment) return { status: 'skipped', reason: 'unknown_status' };
  /*
    Ödemenin künyesindeki sipariş BU DEĞİLSE dokunulmaz. Olmaması gerekir (kolon kısmi unique ve kimliği
    yalnız ödeme açılırken biz yazıyoruz), ama olursa bu bir veri arızasıdır: başka bir siparişin
    ödemesini onaylamak ya da iptal etmek, hiç sorulmamış bir soruya para hareketiyle cevap vermek olurdu.
  */
  if (payment.orderId && payment.orderId !== order.id) {
    await captureError(new Error('reconcileDraftPayment: ödemenin künyesi başka siparişi gösteriyor'), {
      source: SOURCES.applicationOrder,
      context: { orderId: order.id, paymentOrderId: payment.orderId },
    });
    return { status: 'skipped', reason: 'foreign_payment' };
  }

  const reservations = new ReservationService(db);
  const windowOpen = !opts.cancelledByCustomer && (await reservations.listActiveByOrder(order.id)).length > 0;
  const decision = decideDraftPayment({ status: payment.status, windowOpen });

  if (decision === 'wait') return { status: 'waiting', payment };
  if (decision === 'confirm') {
    await confirmOnlinePayment(db, { orderId: order.id, paymentIntentId: payment.id, amountCents: payment.amountReceivedCents }, deps);
    return { status: 'confirmed', payment };
  }

  /*
    Ödeme gelmeyecek: önce sağlayıcıdaki ödeme, sonra taslak kapanır; tersi sırada o an biten ödeme iptal edilmiş siparişe gelirdi.
    İptal reddedilirse sebep çoğunlukla o yarıştır ve ödeme yeniden sorulur; başka sebepte hata fırlar, açık ödemeli taslak iptal edilmez.
  */
  if (payment.status !== 'canceled') {
    try {
      await deps.gateway.cancel(payment.id);
    } catch (error) {
      const again = await deps.gateway.read(payment.id);
      if (again && decideDraftPayment({ status: again.status, windowOpen: false }) === 'confirm') {
        await confirmOnlinePayment(db, { orderId: order.id, paymentIntentId: again.id, amountCents: again.amountReceivedCents }, deps);
        return { status: 'confirmed', payment: again };
      }
      if (!again || again.status !== 'canceled') throw error;
    }
  }

  await reservations.releaseByOrder(order.id);
  // Para çekilmedi; sebep ödemenin gelmemesi ya da müşterinin vazgeçmesidir, ekran cümlesini buna göre kurar.
  const cancelled = await orders.cancel(order.id, 'draft', null, opts.cancelledByCustomer ? 'customer' : 'payment_failed');
  // Kalemler yalnız iptali bu çağrı yaptıysa döner; iki kapı aynı anda kapatırsa sepete iki kez eklenmez.
  if (cancelled.ok) await restoreOrderedLines(db, order.customerId, order.id);
  // İptal maili numaralı sipariş içindir; burada sipariş hiç oluşmadı, müşteri kendi cümlesini alır.
  if (cancelled.ok && !opts.cancelledByCustomer) await notifyExceptionEffect(deps.effects, order.id, 'order_payment_incomplete');
  // Açık bir onay ekranı varsa bekleyişi bitsin: sayfa sunucudan yeniden ister ve iptali görür.
  await ringBell(orderChannelName(order.id));
  return { status: 'cancelled', payment };
}

/**
 * Ödeme zamanlayıcısının turu: yalnız penceresi kapanmış taslaklar sorulur, açık penceredekini onay ekranı kendisi soruyor. Satırlar
 * bağımsızdır; biri düşerse iz bırakılır ve tur sürer.
 */
export async function sweepUnpaidDrafts(
  db: Db,
  deps: ConfirmPaymentDeps,
  opts: { now?: Date; limit?: number } = {},
): Promise<{ checked: number; confirmed: number; cancelled: number; waiting: number; failed: number }> {
  const counts = { checked: 0, confirmed: 0, cancelled: 0, waiting: 0, failed: 0 };
  if (!deps.gateway) return counts;

  const now = opts.now ?? new Date();
  // Bir dakikadan taze taslak kuyruğa girmez: ödeme o an açılıyor olabilir.
  const before = new Date(now.getTime() - 60_000).toISOString();
  const drafts = await new OrderService(db).listOpenOnlineDrafts({ before }, opts.limit);
  const reservations = new ReservationService(db);

  for (const draft of drafts) {
    if ((await reservations.listActiveByOrder(draft.id)).length > 0) continue;
    counts.checked += 1;
    try {
      const outcome = await reconcileOrder(db, draft, deps);
      if (outcome.status === 'confirmed') counts.confirmed += 1;
      else if (outcome.status === 'cancelled') counts.cancelled += 1;
      else if (outcome.status === 'waiting') counts.waiting += 1;
    } catch (error) {
      counts.failed += 1;
      await captureError(error, { source: SOURCES.applicationOrder, context: { flow: 'sweep_unpaid_drafts', orderId: draft.id } });
    }
  }
  return counts;
}
