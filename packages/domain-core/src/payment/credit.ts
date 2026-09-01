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
  'onAccount' | 'paymentStatus' | 'status' | 'orderedTotalCents' | 'amountCollectedCents' | 'amountRefundedCents' | 'createdAt'
>;

/**
 * Siparişin AÇIK tutarı (kuruş): sipariş edilen − net tahsilat. İade tahsilatı geri alır, yani
 * borcu geri getirir — bu yüzden eklenir.
 *
 * **Taban SİPARİŞ EDİLENDİR, ciro değil** (01.09 ad ayrımı): vade defteri siparişin verildiği anda
 * borcu tanır ve o an hiçbir şey gitmemiştir — `revenueTotalCents` orada 0'dır. Cirodan okusaydık
 * hazırlanmamış her vadeli sipariş "borcu yok" görünür, vade limiti de boşuna serbest kalırdı.
 * Kısmi karşılamada tabanın fazla kalması bilinçli: borç kapanışını `payment_status` belirliyor
 * (`isOpenCredit`), yani doğru tutar ödendiğinde satır defterden zaten düşüyor.
 *
 * Kaynak `Order`'ın `amount_*` alanlarıdır; onlar bir CACHE'tir ve gerçeği para hareketleri tutar
 * (12.2). Cache'in tazeliği çağıranın sorunudur, formülün doğruluğu burasının.
 */
export function openAmountCents(
  order: Pick<Order, 'orderedTotalCents' | 'amountCollectedCents' | 'amountRefundedCents'>,
): number {
  // Hesap doğrudan cent üstünde (02.9): eskiden euro çıkarılıp sonuç `* 100` ile çevriliyordu ve
  // çıkarma kayan noktada yapılıyordu — `0.1 + 0.2` sapmasının tam yeri (STACK §8).
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
