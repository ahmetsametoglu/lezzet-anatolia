import type { SupabaseClient } from '@supabase/supabase-js';
import { OrderItemReturnSchema, type OrderItemReturn } from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/** Kalemden düşen adetlerin olayları — yazımı `adjust_fulfillment` yapar, bu servis yalnız okur. */
export class OrderItemReturnService extends BaseDbService<OrderItemReturn, never, never> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'order_item_return', OrderItemReturnSchema, OrderItemReturnSchema as never, OrderItemReturnSchema as never, false);
  }

  /** Siparişlerin olayları, eskiden yeniye; çağıranlar sınırlı küme verir (tek sipariş ya da rampanın tavanlı listesi). */
  listByOrders(orderIds: readonly string[]): Promise<OrderItemReturn[]> {
    if (orderIds.length === 0) return Promise.resolve([]);
    return this.getAll({ orderId: [...orderIds] }, { orderBy: 'createdAt' });
  }
}
