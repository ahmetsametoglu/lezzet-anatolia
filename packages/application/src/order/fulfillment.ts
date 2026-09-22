import { OrderService } from '@lezzet/database';
import type { DeliverResult } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyStatusEffect, type OrderEffects } from './effects';
import { settleOrder } from './settle';

/**
 * Teslim: ayrılmış ve fiili stok kayıtlı partilerden düşer, teslim onayı yazılır. Teslim durum geçişinden değil
 * kendi RPC'sinden geçtiği için haber burada ve yalnız teslim gerçekleştiyse tetiklenir.
 */
export async function deliverOrder(
  db: SupabaseClient,
  orderId: string,
  opts: { actorId?: string | null; deliveryProof?: Record<string, unknown> | null; effects?: OrderEffects } = {},
): Promise<DeliverResult> {
  const result = await new OrderService(db).deliver(orderId, opts);
  if (result.ok) {
    await notifyStatusEffect(opts.effects, orderId, 'delivered');
    // Parası önceden alınmış sipariş teslimle kapanır; ödeme sonra gelirse kapanışı ödeme senkronu yapar.
    await settleOrder(db, orderId);
  }
  return result;
}
