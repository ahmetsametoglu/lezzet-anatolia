import { addDays, parisDateOf } from '@lezzet/helper';
import type { Order } from '@lezzet/types';

/**
 * Vadeli satışın parası (DOMAIN §7): açık bakiye ve gecikme saklanmaz, türetilir, ve türetim tek yerde durur ki checkout freni,
 * sipariş listesi ve müşteri kartı aynı cevabı versin. Vade süresi girdidir: müşteri bazındadır, yoksa ayardan gelir.
 */

/** Genel vade süresi ayarı; müşteriye özel süre (`payment_term_days` kolonu) boşsa geçerlidir. */
export const PAYMENT_TERM_DAYS_KEY = 'payment_term_days';
export const PAYMENT_TERM_DAYS_DEFAULT = 30;

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

/** Vade günü (`YYYY-MM-DD`): siparişin Paris'teki günü + vade süresi, takvim günü olarak; saatle toplamak yaz saati geçişinde günü kaydırırdı. */
export function dueDayOf(createdAt: string | Date, termDays: number): string {
  return addDays(parisDateOf(new Date(createdAt)), termDays);
}

/**
 * Bu sipariş vade kapsamında AÇIK mı — vadeli, ödenmemiş ve iptal edilmemiş.
 * İptal edilen sipariş borç doğurmaz; ödenmiş sipariş zaten kapanmıştır.
 */
export function isOpenCredit(order: CreditOrder): boolean {
  return order.onAccount && order.paymentStatus !== 'paid' && order.status !== 'cancelled';
}

/** Vadesi geçmiş mi: açık vadeli sipariş ve vade günü Paris takviminde geride kaldı; vade gününün kendisi henüz gecikme değildir. */
export function isOverdue(order: CreditOrder, termDays: number, now: Date = new Date()): boolean {
  return isOpenCredit(order) && parisDateOf(now) > dueDayOf(order.createdAt, termDays);
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
