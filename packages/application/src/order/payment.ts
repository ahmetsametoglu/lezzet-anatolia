import { MoneyMovementService, OrderService } from '@lezzet/database';
import { derivePaymentStatusForOrder, type PaymentDerivation } from '@lezzet/domain-core';
import { revokeReferralOnUnpaidOrder, rewardReferralOnPaidOrder } from '../feedback/points';
import type { MovementSource, Order, OrderItem, PaymentStatus } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { settleOrder } from './settle';

/**
 * Siparişin para bağları: veritabanı hareketi yazar, motor ödeme durumunu türetir, burası ikisini bağlar.
 * `payment_status` liste süzgeci için saklanır; doğru kalması için tek yazım yolu buradan geçer.
 */

export type PaymentOutcome =
  | {
      status: 'ok';
      amountCollectedCents: number;
      amountRefundedCents: number;
      paymentStatus: PaymentStatus;
      derivation: PaymentDerivation;
      /** Yeni hareket yazılmadı, aynı anahtarla önceki tahsilat bulundu; sonucun geri kalanı günceldir. */
      deduped?: true;
    }
  | { status: 'not_found' };

export interface OrderMovementInput {
  orderId: string;
  /** Paranın girdiği/çıktığı hesap (kasa, banka, Stripe). */
  accountId: string;
  /** Cent. */
  amountCents: number;
  valueDate?: string;
  description?: string | null;
  /** Sistemin kendi akışları `system` geçer, operatörün elle girdiği satırdan ayrışsın diye; verilmezse `manual`. */
  source?: MovementSource;
  /** Sağlayıcı künyesi: tahsilatta `{ providerRef }` yazılır, iade o referans üzerinden döner. */
  meta?: Record<string, unknown> | null;
  /**
   * Aynı tahsilatın iki kez yazılmasını engeller: kurye cevabını alamadığı isteği tekrar gönderir.
   * Kararı veritabanı verir (tekil indeks), eşzamanlı iki istek de yakalanır.
   */
  idempotencyKey?: string | null;
}

/** Tahsilat — kapıda nakit/kart, havale, Stripe onayı, kurye gün kapanışı. */
export function recordOrderPayment(db: SupabaseClient, input: OrderMovementInput): Promise<PaymentOutcome> {
  return writeOrderMovement(db, input, 'order_payment');
}

/** İade — kısmi karşılama farkı, iptal, iade. */
export function recordOrderRefund(db: SupabaseClient, input: OrderMovementInput): Promise<PaymentOutcome> {
  return writeOrderMovement(db, input, 'order_refund');
}

async function writeOrderMovement(
  db: SupabaseClient,
  input: OrderMovementInput,
  type: 'order_payment' | 'order_refund',
): Promise<PaymentOutcome> {
  const found = await new OrderService(db).getWithItems(input.orderId);
  if (!found) return { status: 'not_found' };

  /* Tekrar kontrolü veride: tekil indeks ikinci yazımı reddeder, RPC var olan hareketin sonucunu `deduped` ile döndürür. */
  const amounts = await new MoneyMovementService(db).recordForOrder({
    orderId: input.orderId,
    accountId: input.accountId,
    amountCents: input.amountCents,
    valueDate: input.valueDate,
    description: input.description,
    source: input.source,
    meta: input.meta ?? null,
    idempotencyKey: input.idempotencyKey,
    type,
  });
  const outcome = await finalize(db, found.order, found.items, amounts.amountCollectedCents, amounts.amountRefundedCents);
  // Tekrar eden istek ilk isteğin cevabını görür; değişen tek şey "yeni bir şey yazılmadı" bilgisi.
  return outcome.status === 'ok' && amounts.deduped === true ? { ...outcome, deduped: true } : outcome;
}

/**
 * Ödeme durumunu yeniden türetip yazar. Para dışındaki değişikliklerde de çağrılır: karşılanan tutar
 * kısmi karşılamada ya da iptalde değişir.
 */
export async function syncOrderPaymentStatus(db: SupabaseClient, orderId: string): Promise<PaymentOutcome> {
  const found = await new OrderService(db).getWithItems(orderId);
  if (!found) return { status: 'not_found' };

  // Cache'i de tazele: hareket elle silinmiş/düzeltilmiş olabilir.
  const amounts = await new MoneyMovementService(db).resyncOrder(orderId);
  return finalize(db, found.order, found.items, amounts.amountCollectedCents, amounts.amountRefundedCents);
}

async function finalize(
  db: SupabaseClient,
  order: Order,
  items: OrderItem[],
  collectedCents: number,
  refundedCents: number,
): Promise<PaymentOutcome> {
  // Eşleme motorda (kargo, indirim payı, iptal kuralı) — burada tekrarlanmaz.
  const derivation = derivePaymentStatusForOrder(order, items, { collectedCents, refundedCents });

  if (derivation.status !== order.paymentStatus) {
    await new OrderService(db).update({ id: order.id, paymentStatus: derivation.status });

    /**
     * Getirenin ödülü para gerçekten alındığında doğar; kartta sipariş, kapıda teslim anını kapsayan
     * tek an durumun `paid`e döndüğü andır. Ödül asıl işlemi durdurmaz.
     */
    if (derivation.status === 'paid') await rewardReferralOnPaidOrder(db, order.id);

    /**
     * Elde hiç para kalmadıysa (`refunded` ya da `pending`) ödül geri alınır; kısmi iade kısmi
     * sipariş sayıldığı için `partial` kapsam dışıdır.
     */
    if (derivation.status === 'refunded' || derivation.status === 'pending') {
      await revokeReferralOnUnpaidOrder(db, order.id);
    }
  }

  // Değişim şartı yok: parası önceden alınmış sipariş teslimden sonraki senkronda kapanır.
  if (derivation.status === 'paid') await settleOrder(db, order.id);

  return {
    status: 'ok',
    amountCollectedCents: collectedCents,
    amountRefundedCents: refundedCents,
    paymentStatus: derivation.status,
    derivation,
  };
}
