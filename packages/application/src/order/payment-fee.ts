import { MoneyMovementService, OrderService } from '@lezzet/database';
import { CARD_FEE_NATURE } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Sağlayıcı komisyonu: havuzdan çıkan gider ve siparişin `paymentFee` alanı; yazım anahtarı ödemedir ki aynı komisyonu getiren ikinci
 * okuma (ödeme bildirimi, aktarım raporu) ikinci satır doğurmasın. Gider satırına sipariş bağı yazılmaz, çünkü siparişin tahsilat
 * toplamı o bağdan türer; bağ künyede durur.
 */
export async function recordPaymentFee(
  db: SupabaseClient,
  input: { orderId: string; accountId: string; paymentRef: string; feeCents: number; meta?: Record<string, unknown> },
): Promise<boolean> {
  if (input.feeCents <= 0) return false;
  const written = await new MoneyMovementService(db).insertOnce({
    accountId: input.accountId,
    direction: 'out',
    amountCents: input.feeCents,
    type: 'expense',
    nature: CARD_FEE_NATURE,
    description: 'Kart ödemesi komisyonu',
    meta: { ...input.meta, providerRef: input.paymentRef, orderId: input.orderId },
    source: 'system',
    idempotencyKey: `card-fee:${input.paymentRef}`,
  });
  if (!written) return false;

  // Alan siparişin bütün kart ödemelerinin komisyon toplamıdır, çünkü şirket kârı komisyonu yalnız sipariş kârından düşer.
  const orders = new OrderService(db);
  const order = await orders.getById(input.orderId);
  if (order) await orders.update({ id: order.id, paymentFeeCents: (order.paymentFeeCents ?? 0) + input.feeCents });
  return true;
}
