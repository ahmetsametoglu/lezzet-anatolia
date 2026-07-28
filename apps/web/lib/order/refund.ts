import { MoneyMovementService, OrderService, serviceDb } from '@lezzet/database';
import { canTransition } from '@lezzet/domain-core';
import type { FulfillmentAdjustment, OrderStatus, PaymentStatus } from '@lezzet/types';
import { recordOrderRefund, syncOrderPaymentStatus } from '../money/order-payment';
import { notifyOrderException } from './notify';

/**
 * Kısmi karşılama (07.8) ve iptal/iade (07.9) kapısı — **uygulama katmanı orkestrasyonu**.
 * DOMAIN §8, ORDER_LIFECYCLE.
 *
 * Üç katman birleşir: malın gerçeğini veritabanı yazar (`adjust_fulfillment` / `cancel_order`,
 * bölünemez), iade borcunu motor TÜRETİR (`derivePaymentStatus`), hareketi para kapısı yazar (12.2).
 *
 * **"Peşin mi, kapıda mı" diye dallanılmaz.** İade borcu = net tahsilat − karşılanan tutar; bu sayı
 * peşin ödenmişse kendiliğinden pozitif çıkar (fark iade edilir), kapıda ödenecekse sıfır çıkar
 * (yalnız tahsil edilecek tutar düşer). Tek yol, iki sonuç — ödeme yöntemine bakan bir `if` yok.
 *
 * İadenin gideceği hesap da SORULMAZ, türetilir: para hangi hesaba girdiyse oradan çıkar (son
 * tahsilat hareketi). Çağıran isterse başka hesap verebilir (Stripe'tan tahsil, nakit iade).
 */

interface RefundOutcome {
  /** Fiilen yazılan iade tutarı (€). 0 = iade borcu yoktu. */
  refundedAmount: number;
  paymentStatus: PaymentStatus;
  /** Kapıda/vadeli tahsil edilmeyi bekleyen kalan (€) — kısmi karşılamada düşmüş hâli. */
  amountToCollect: number;
}

type AdjustOutcome =
  | ({ status: 'ok'; restockedQty: number; discardedQty: number; releasedQty: number } & RefundOutcome)
  /** Sipariş artık düzeltilebilir bir durumda değil (iptal edilmiş). */
  | { status: 'stale'; currentStatus: OrderStatus }
  | { status: 'not_found' };

type CancelOutcome =
  | ({ status: 'ok'; releasedQty: number } & RefundOutcome)
  | { status: 'forbidden'; reason: 'same_status' | 'terminal' | 'not_allowed' }
  | { status: 'stale'; currentStatus: OrderStatus }
  | { status: 'not_found' };

interface RefundOptions {
  /** İadenin çıkacağı hesap — verilmezse paranın girdiği hesaptan türetilir. */
  refundAccountId?: string | null;
  /**
   * Tutarı elle vermek. Tek gerçek kullanımı **jest iadesidir** (`goodwill`): mal müşteride kaldığı
   * için karşılanan tutar düşmez, borç türetilemez — tutarı operatör söyler (DOMAIN §8).
   */
  refundAmount?: number | null;
  valueDate?: string;
  description?: string | null;
}

/**
 * **Kısmi karşılama / kalem iadesi** (07.8). Eksik çıkan ya da geri gelen adet yazılır; ardından
 * ödeme durumu yeniden türetilir ve iade borcu varsa hareket yazılır.
 *
 * Sıra önemlidir: önce mal, sonra para. Tersi olsaydı iade yazılıp düzeltme başarısız olduğunda
 * "parası iade edilmiş ama hâlâ karşılanmış görünen" sipariş kalırdı.
 */
export async function adjustFulfillment(
  orderId: string,
  lines: readonly FulfillmentAdjustment[],
  opts: RefundOptions & { actorId?: string | null } = {},
): Promise<AdjustOutcome> {
  const orders = new OrderService(serviceDb());
  if (!(await orders.getById(orderId))) return { status: 'not_found' };

  const result = await orders.adjustFulfillment(orderId, lines, opts.actorId);
  if (!result.ok) return { status: 'stale', currentStatus: result.currentStatus };

  const settled = await settleRefund(orderId, opts);
  if (!settled) return { status: 'not_found' };

  // Haberin hangisi olduğunu malın nerede olduğu belirler: mal daha çıkmadıysa bu bir EKSİK
  // KARŞILANMA (müşteri kapıda sürprizle karşılaşmasın), çıktıysa bir İADE (para geri döndü).
  const delivered = result.currentStatus === 'delivered' || result.currentStatus === 'completed';
  await notifyOrderException(orderId, delivered ? 'order_refunded' : 'order_shortfall', { refundedAmount: settled.refundedAmount });

  return {
    status: 'ok',
    restockedQty: result.restockedQty ?? 0,
    discardedQty: result.discardedQty ?? 0,
    releasedQty: result.releasedQty ?? 0,
    ...settled,
  };
}

/**
 * **İptal** (07.9). Ayrılmış mal geri bırakılır ve tahsil edilmiş para varsa TAMAMI iade edilir —
 * iptal edilen siparişte karşılanan tutar 0'dır (ORDER_LIFECYCLE), gerisi türetimden gelir.
 */
export async function cancelOrder(
  orderId: string,
  opts: RefundOptions & { actorId?: string | null } = {},
): Promise<CancelOutcome> {
  const orders = new OrderService(serviceDb());

  const order = await orders.getById(orderId);
  if (!order) return { status: 'not_found' };

  // Kural motorun: teslim edilmiş sipariş iptal edilmez, iade yoluna girer (`returned`).
  const verdict = canTransition(order.status, 'cancelled');
  if (!verdict.allowed) return { status: 'forbidden', reason: verdict.reason };

  const result = await orders.cancel(orderId, order.status, opts.actorId);
  if (!result.ok) return { status: 'stale', currentStatus: result.currentStatus };

  const settled = await settleRefund(orderId, { description: 'Sipariş iptali — iade', ...opts });
  if (!settled) return { status: 'not_found' };

  await notifyOrderException(orderId, 'order_cancelled', { refundedAmount: settled.refundedAmount });

  return { status: 'ok', releasedQty: result.releasedQty ?? 0, ...settled };
}

/**
 * Ödeme durumunu tazeler ve borç varsa iadeyi yazar. Borç türetimden gelir; tek istisnası çağıranın
 * verdiği açık tutardır (jest iadesi).
 *
 * İade hareketi yazıldığında durum bir kez daha türetilir (para kapısı yapar) — bu yüzden dönen
 * değer hareketten SONRAKİ hâldir, öncekinden değil.
 */
async function settleRefund(orderId: string, opts: RefundOptions): Promise<RefundOutcome | null> {
  const before = await syncOrderPaymentStatus(orderId);
  if (before.status !== 'ok') return null;

  const dueAmount = opts.refundAmount ?? before.derivation.refundDueCents / 100;
  if (dueAmount <= 0) {
    return {
      refundedAmount: 0,
      paymentStatus: before.paymentStatus,
      amountToCollect: before.derivation.amountToCollectCents / 100,
    };
  }

  const accountId = opts.refundAccountId ?? (await lastPaymentAccount(orderId));
  // Hesap türetilemiyorsa iade yazılamaz ama düzeltme geçerlidir: borç `amountToCollect`'in negatifi
  // olarak zaten görünür. Sessizce yanlış hesaba yazmaktansa borcu açıkta bırakmak doğrudur.
  if (!accountId) {
    return {
      refundedAmount: 0,
      paymentStatus: before.paymentStatus,
      amountToCollect: before.derivation.amountToCollectCents / 100,
    };
  }

  const after = await recordOrderRefund({
    orderId,
    accountId,
    amount: dueAmount,
    valueDate: opts.valueDate,
    description: opts.description ?? 'Sipariş iadesi',
  });
  if (after.status !== 'ok') return null;

  return {
    refundedAmount: dueAmount,
    paymentStatus: after.paymentStatus,
    amountToCollect: after.derivation.amountToCollectCents / 100,
  };
}

/** Para hangi hesaba girdiyse oradan çıkar — son tahsilat hareketinin hesabı. */
async function lastPaymentAccount(orderId: string): Promise<string | null> {
  const movements = await new MoneyMovementService(serviceDb()).listByOrder(orderId);
  const payments = movements.filter((movement) => movement.type === 'order_payment');
  return payments.at(-1)?.accountId ?? null;
}
