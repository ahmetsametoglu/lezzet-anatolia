import type { Order } from '@lezzet/types';

/**
 * Vadeli satışın parası (DOMAIN §7): açık bakiye ve gecikme saklanmaz, türetilir, ve türetim tek yerde durur ki checkout freni,
 * sipariş listesi ve müşteri kartı aynı cevabı versin. Vade süresi girdidir: müşteri bazındadır, yoksa ayardan gelir.
 */

/** Vade kapsamındaki sipariş için gereken asgari alanlar. */
export type CreditOrder = Pick<
  Order,
  'onAccount' | 'paymentStatus' | 'status' | 'orderedTotalCents' | 'amountCollectedCents' | 'amountRefundedCents' | 'createdAt'
>;

/**
 * Siparişin açık tutarı (kuruş): sipariş edilen − net tahsilat; taban ciro değil sipariş edilendir, çünkü vade borcu sipariş anında
 * tanınır ve o an hiçbir şey gitmemiştir. Borcun kapanışını `payment_status` belirler (`isOpenCredit`).
 */
export function openAmountCents(
  order: Pick<Order, 'orderedTotalCents' | 'amountCollectedCents' | 'amountRefundedCents'>,
): number {
  // Hesap doğrudan cent üstünde, ki çıkarma kayan noktada sapmasın.
  return order.orderedTotalCents - order.amountCollectedCents + order.amountRefundedCents;
}

/** Vade günü — sipariş tarihinden itibaren. */
export function dueDateOf(createdAt: string | Date, termDays: number): Date {
  return new Date(new Date(createdAt).getTime() + termDays * 86_400_000);
}

/**
 * Bu sipariş vade kapsamında AÇIK mı — vadeli, ödenmemiş ve iptal edilmemiş.
 * İptal edilen sipariş borç doğurmaz; ödenmiş sipariş zaten kapanmıştır.
 */
export function isOpenCredit(order: CreditOrder): boolean {
  return order.onAccount && order.paymentStatus !== 'paid' && order.status !== 'cancelled';
}

/** Vadesi geçmiş mi — açık vadeli sipariş + vade günü geride kaldıysa. */
export function isOverdue(order: CreditOrder, termDays: number, now: Date = new Date()): boolean {
  return isOpenCredit(order) && dueDateOf(order.createdAt, termDays).getTime() < now.getTime();
}

export interface CreditPosition {
  /** Ödenmemiş vadeli siparişlerin toplamı (kuruş). */
  openBalanceCents: number;
  /** En az bir sipariş vadesini aşmış mı — checkout freninin ölçütü. */
  hasOverdue: boolean;
}

/** Müşterinin vade durumu — açık siparişlerden türer, hiçbir yerde saklanmaz. */
export function creditPosition(
  orders: readonly CreditOrder[],
  termDays: number,
  now: Date = new Date(),
): CreditPosition {
  let openBalanceCents = 0;
  let hasOverdue = false;
  for (const order of orders) {
    if (!isOpenCredit(order)) continue;
    openBalanceCents += openAmountCents(order);
    if (isOverdue(order, termDays, now)) hasOverdue = true;
  }
  return { openBalanceCents: Math.max(0, openBalanceCents), hasOverdue };
}
