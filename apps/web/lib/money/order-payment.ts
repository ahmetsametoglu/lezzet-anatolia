import { MoneyMovementService, OrderService, serviceDb } from '@lezzet/database';
import { derivePaymentStatusForOrder, type PaymentDerivation } from '@lezzet/domain-core';
import { toCents } from '@lezzet/helper';
import type { Order, OrderItem, PaymentStatus } from '@lezzet/types';

/**
 * Siparişin para bağları (12.2) — **uygulama katmanı orkestrasyonu**. DOMAIN §7, §9.
 *
 * Üç katman bir araya gelir:
 * - **Veritabanı** hareketi yazar ve `amount_*` cache'ini KAYNAKTAN yeniden hesaplar (tek transaction).
 * - **Motor** ödeme durumunu TÜRETİR (`derivePaymentStatus`): net tahsilat vs karşılanan tutar.
 * - **Burası** ikisini bağlar ve türetilen durumu siparişe yazar.
 *
 * `payment_status` neden saklanıyor: liste ekranları ("ödenmemiş vadeli siparişler") onu süzer;
 * her satırda kalemleri okuyup yeniden türetmek her listeyi N+1 yapardı. Saklanan türetim ancak
 * **her değişimde yeniden hesaplanırsa** doğru kalır — o yüzden tek yazım yolu buradan geçer.
 */

type PaymentOutcome =
  | { status: 'ok'; amountCollectedCents: number; amountRefundedCents: number; paymentStatus: PaymentStatus; derivation: PaymentDerivation }
  | { status: 'not_found' };

interface OrderMovementInput {
  orderId: string;
  /** Paranın girdiği/çıktığı hesap (kasa, banka, Stripe). */
  accountId: string;
  amount: number;
  valueDate?: string;
  description?: string | null;
  source?: 'manual' | 'bank_import';
  /**
   * Sağlayıcı künyesi (07.11) — tahsilatta `{ providerRef: 'pi_...' }` yazılır ve iade o referansın
   * üzerinden döner. Kapıda nakit/kart tahsilatında yoktur: dönülecek bir sağlayıcı da yoktur.
   */
  meta?: Record<string, unknown> | null;
}

/** Tahsilat — kapıda nakit/kart, havale, Stripe onayı, kurye gün kapanışı. */
export function recordOrderPayment(input: OrderMovementInput): Promise<PaymentOutcome> {
  return writeOrderMovement(input, 'order_payment');
}

/** İade — kısmi karşılama farkı (07.8), iptal/iade (07.9). */
export function recordOrderRefund(input: OrderMovementInput): Promise<PaymentOutcome> {
  return writeOrderMovement(input, 'order_refund');
}

async function writeOrderMovement(input: OrderMovementInput, type: 'order_payment' | 'order_refund'): Promise<PaymentOutcome> {
  const db = serviceDb();
  const found = await new OrderService(db).getWithItems(input.orderId);
  if (!found) return { status: 'not_found' };

  const amounts = await new MoneyMovementService(db).recordForOrder({ ...input, type });
  // `OrderAmounts` (RPC dönüşü) hâlâ euro — para hareketi ailesi henüz göçmedi (02.9 dilim 5).
  // Çevrim burada, ortak `toCents` ile; o dilim gelince bu iki satır de düşecek.
  return finalize(db, found.order, found.items, toCents(amounts.amountCollected), toCents(amounts.amountRefunded));
}

/**
 * Ödeme durumunu yeniden türetip yazar. Para DIŞINDA bir şey değiştiğinde de çağrılır: kısmi
 * karşılamada `fulfilled_qty` düşünce (07.8) ya da sipariş iptal olunca karşılanan tutar değişir —
 * tahsilat hiç değişmese bile durum değişir.
 */
export async function syncOrderPaymentStatus(orderId: string): Promise<PaymentOutcome> {
  const db = serviceDb();
  const found = await new OrderService(db).getWithItems(orderId);
  if (!found) return { status: 'not_found' };

  // Cache'i de tazele: hareket elle silinmiş/düzeltilmiş olabilir.
  const amounts = await new MoneyMovementService(db).resyncOrder(orderId);
  // `OrderAmounts` (RPC dönüşü) hâlâ euro — para hareketi ailesi henüz göçmedi (02.9 dilim 5).
  // Çevrim burada, ortak `toCents` ile; o dilim gelince bu iki satır de düşecek.
  return finalize(db, found.order, found.items, toCents(amounts.amountCollected), toCents(amounts.amountRefunded));
}

async function finalize(
  db: ReturnType<typeof serviceDb>,
  order: Order,
  items: OrderItem[],
  collectedCents: number,
  refundedCents: number,
): Promise<PaymentOutcome> {
  // Eşleme motorda (kargo, indirim payı, iptal kuralı) — burada tekrarlanmaz.
  const derivation = derivePaymentStatusForOrder(order, items, { collectedCents, refundedCents });

  if (derivation.status !== order.paymentStatus) {
    await new OrderService(db).update({ id: order.id, paymentStatus: derivation.status });
  }

  return {
    status: 'ok',
    amountCollectedCents: collectedCents,
    amountRefundedCents: refundedCents,
    paymentStatus: derivation.status,
    derivation,
  };
}
