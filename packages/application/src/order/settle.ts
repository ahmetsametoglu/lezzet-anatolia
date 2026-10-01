import { OrderService } from '@lezzet/database';
import { isSettled } from '@lezzet/domain-core';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Teslim edilmiş ve parası tamamen alınmış (hediyede ödemesiz) siparişi kapatır. Teslim ve ödeme hangi sırayla tamamlanırsa
 * tamamlansın ikincisinin ardından çağrılır; geçiş koşullu olduğu için araya iade süreci girdiyse yazmaz.
 */
export async function settleOrder(db: SupabaseClient, orderId: string): Promise<boolean> {
  const orders = new OrderService(db);
  const order = await orders.getById(orderId);
  if (!order || !isSettled(order.status, order.paymentStatus, order.isGiftOrder)) return false;

  const result = await orders.transition({ orderId, from: 'delivered', to: 'completed', actorId: null });
  return result.ok;
}
