import type { SupabaseClient } from '@supabase/supabase-js';
import {
  OrderDeliveryCodeInsertSchema,
  OrderDeliveryCodeSchema,
  type DoorCodeVia,
  type OrderDeliveryCode,
  type OrderDeliveryCodeInsert,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/** Kapı kodu satırları; kodun kime ve ne zaman üretileceği kararı çağıranda. */
export class OrderDeliveryCodeService extends BaseDbService<OrderDeliveryCode, OrderDeliveryCodeInsert, never> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'order_delivery_code', OrderDeliveryCodeSchema, OrderDeliveryCodeInsertSchema, OrderDeliveryCodeSchema as never, false);
  }

  getByOrder(orderId: string): Promise<OrderDeliveryCode | null> {
    return this.getOneBy({ orderId });
  }

  /** Kurye listesi duraklarını tek turda okur; liste seferin duraklarıyla sınırlıdır. */
  listByOrders(orderIds: readonly string[]): Promise<OrderDeliveryCode[]> {
    if (orderIds.length === 0) return Promise.resolve([]);
    return this.getAll({ orderId: [...orderIds] });
  }

  /** Sipariş ikinci kez yola çıkarsa kod değişmez, çünkü müşteri ilk kodu almıştır; var olan satır döner. */
  async issue(input: OrderDeliveryCodeInsert): Promise<OrderDeliveryCode> {
    const created = await this.insertIgnoringConflict(input);
    if (created) return created;
    const existing = await this.getByOrder(input.orderId);
    if (!existing) throw new Error(`order_delivery_code ${input.orderId}: çakışma oldu ama satır okunamadı`);
    return existing;
  }

  markSent(orderId: string, via: DoorCodeVia): Promise<void> {
    return this.updateWhereIn('orderId', [orderId], { sentVia: via });
  }

  /** Yanlış denemeyi veritabanında sayar ve yeni sayıyı döndürür. */
  recordFailure(orderId: string): Promise<number> {
    return this.executeRpc<number>('order_delivery_code_fail', { p_order_id: orderId });
  }
}
