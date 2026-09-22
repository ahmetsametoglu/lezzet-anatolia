import { OrderService, ReservationService, type Db } from '@lezzet/database';
import { decideDraftPayment } from '@lezzet/domain-core';
import { captureError, SOURCES } from '@lezzet/observability';
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

export async function reconcileDraftPayment(db: Db, orderId: string, deps: ConfirmPaymentDeps): Promise<ReconcileOutcome> {
  const orders = new OrderService(db);
  const order = await orders.getById(orderId);
  if (!order) return { status: 'skipped', reason: 'not_found' };
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
  const windowOpen = (await reservations.listActiveByOrder(order.id)).length > 0;
  const decision = decideDraftPayment({ status: payment.status, windowOpen });

  if (decision === 'wait') return { status: 'waiting', payment };
  if (decision === 'confirm') {
    await confirmOnlinePayment(db, { orderId: order.id, paymentIntentId: payment.id, amountCents: payment.amountReceivedCents }, deps);
    return { status: 'confirmed', payment };
  }

  /*
    ÖDEME GELMEYECEK — önce sağlayıcıdaki ödeme kapatılır, sonra taslak. Sıra şart: taslak önce kapansa
    ve müşteri tam o an ödemeyi bitirse, para iptal edilmiş bir siparişe gelirdi (webhook onu iade eder
    ama müşteri boşuna bekler). İptal reddedilirse sebebi büyük ihtimalle tam o yarıştır: ödeme az önce
    geçti — yeniden sorulur ve geçtiyse onay yoluna gidilir. Başka bir sebepse hata YUTULMAZ, fırlar:
    ödemesi açık kalmış bir taslağı iptal etmek, sonradan gelen parayı sahipsiz bırakırdı.
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
  // Sebep `payment_failed`: para çekilmedi, ödeme gelmedi. Ekran bu sebeple "tahsilat yapılmadı" der.
  await orders.cancel(order.id, 'draft', null, 'payment_failed');
  // İptal maili numaralı sipariş içindir; burada sipariş hiç oluşmadı, müşteri kendi cümlesini alır.
  await notifyExceptionEffect(deps.effects, order.id, 'order_payment_incomplete');
  // Açık bir onay ekranı varsa bekleyişi bitsin: sayfa sunucudan yeniden ister ve iptali görür.
  await ringBell(orderChannelName(order.id));
  return { status: 'cancelled', payment };
}

/** Yeni ödeme açılmadan önce bulunan açık ödeme; `openPaymentBefore`ın cevabı. */
export interface OpenPayment {
  orderId: string;
  /** `paid`: önceki ödeme geçti ve sipariş onaylandı · `processing`: banka hâlâ işliyor. */
  state: 'paid' | 'processing';
}

/**
 * Önceki ödeme geçtiyse ya da bankada işleniyorsa yeni ödeme açmak aynı sepet için iki çekim olurdu: geçtiyse sipariş burada
 * onaylanır, işleniyorsa müşteri bekletilir. Ödenmemişse `null`; yeni deneme eski taslağı ve ödemesini kapatır (`placeOrder`).
 */
export async function openPaymentBefore(db: Db, customerId: string, deps: ConfirmPaymentDeps): Promise<OpenPayment | null> {
  const draft = await new OrderService(db).findOpenOnlineDraft(customerId);
  if (!draft) return null;
  const outcome = await reconcileDraftPayment(db, draft.id, deps);
  if (outcome.status === 'confirmed') return { orderId: draft.id, state: 'paid' };
  if (outcome.status === 'waiting' && (outcome.payment.status === 'processing' || outcome.payment.status === 'requires_capture')) {
    return { orderId: draft.id, state: 'processing' };
  }
  return null;
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
  const drafts = await new OrderService(db).listOpenOnlineDraftsBefore(before, opts.limit);
  const reservations = new ReservationService(db);

  for (const draft of drafts) {
    if ((await reservations.listActiveByOrder(draft.id)).length > 0) continue;
    counts.checked += 1;
    try {
      const outcome = await reconcileDraftPayment(db, draft.id, deps);
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
