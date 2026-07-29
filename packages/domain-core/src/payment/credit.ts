import type { Order } from '@lezzet/types';

/**
 * Vadeli satışın parası (DOMAIN §7) — SAF karar, DB'siz.
 *
 * **Açık bakiye ve gecikme SAKLANMAZ, türetilir:** saklanan bakiye bir gün kayar ve kimse fark
 * etmez. Türetim tek yerde durur, çünkü aynı soruyu üç yer soruyor ve üçü de aynı cevabı vermek
 * zorunda: checkout freni ("bu müşteriye vadeli satış açık mı"), sipariş listesi ("bu satır
 * gecikmiş mi") ve müşteri kartı ("ne kadar borcu var").
 *
 * Vade süresi girdidir, burada varsayılmaz: müşteri bazındadır (`payment_term_days`) ve yoksa
 * `Setting`'ten gelir — ikisini de okuyan uygulama katmanıdır.
 */

/** Vade kapsamındaki sipariş için gereken asgari alanlar. */
export type CreditOrder = Pick<
  Order,
  'onAccount' | 'paymentStatus' | 'status' | 'total' | 'amountCollected' | 'amountRefunded' | 'createdAt'
>;

/**
 * Siparişin AÇIK tutarı (kuruş): toplam − net tahsilat. İade tahsilatı geri alır, yani borcu geri
 * getirir — bu yüzden eklenir.
 *
 * Kaynak `Order`'ın `amount_*` alanlarıdır; onlar bir CACHE'tir ve gerçeği para hareketleri tutar
 * (12.2). Cache'in tazeliği çağıranın sorunudur, formülün doğruluğu burasının.
 */
export function openAmountCents(order: Pick<Order, 'total' | 'amountCollected' | 'amountRefunded'>): number {
  return Math.round((order.total - order.amountCollected + order.amountRefunded) * 100);
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
