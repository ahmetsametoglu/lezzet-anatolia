import type { SupabaseClient } from '@supabase/supabase-js';
import {
  OrderBoxInsertSchema,
  OrderBoxItemInsertSchema,
  OrderBoxItemSchema,
  OrderBoxItemUpdateSchema,
  OrderBoxSchema,
  OrderBoxUpdateSchema,
  type OrderBox,
  type OrderBoxInsert,
  type OrderBoxItem,
  type OrderBoxItemInsert,
  type OrderBoxItemUpdate,
  type OrderBoxUpdate,
  type PreparationPick,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Sipariş kutusu (`order_box`, Modül 23 · `0048_order_box.sql`) — bizim bastığımız QR'ın kaydı.
 *
 * Servis SAF I/O'dur: kutu döngüsünün kuralları (kimin kutusu, açılabilir mi, birleşim nasıl
 * kurulur) uygulama katmanında (`application/warehouse/boxes.ts`); kapanışın kendisi RPC'de
 * (`seal_order_box` — kutu + picks tek transaction, STACK §13). Buradan `sealed_at` yazan bir
 * kapı BİLEREK yok: mühür yalnız RPC'den vurulur.
 */
export class OrderBoxService extends BaseDbService<OrderBox, OrderBoxInsert, OrderBoxUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'order_box', OrderBoxSchema, OrderBoxInsertSchema, OrderBoxUpdateSchema, false);
  }

  /** Siparişin kutuları, sipariş içi sırayla — hazırlık kuyruğunun ve web özetinin okuması. */
  async listByOrder(orderId: string): Promise<OrderBox[]> {
    return this.getAll({ orderId }, { orderBy: 'boxNo' });
  }

  /** Birden çok siparişin kutuları TEK sorguda — kuyruk sipariş başına tur atmasın (21.11d dersi). */
  async listByOrders(orderIds: string[]): Promise<OrderBox[]> {
    if (orderIds.length === 0) return [];
    return this.getAll({ orderId: orderIds }, { orderBy: 'boxNo' });
  }

  /** Okutulan QR'ın kutusu — yükleme ve teslim (23.8) yalnız kodu görür. */
  async getByCode(code: string): Promise<OrderBox | null> {
    return this.getOneBy({ code });
  }

  /**
   * **Kutu kapanışı** (`seal_order_box`, 0048): kutu kalemleri + hazırlık kaydı + mühür TEK
   * transaction. `picks` ABSOLÜT birleşimdir — kurma sorumluluğu çağıran kapıda (`sealBox`);
   * RPC eşitliği denetler (Σ kutu = karşılanan) ve bozuksa TÜMÜNÜ geri alır.
   */
  async seal(
    boxId: string,
    items: ReadonlyArray<{ orderItemId: string; qty: number }>,
    picks: readonly PreparationPick[],
    actorId: string | null,
  ): Promise<void> {
    await this.executeRpc('seal_order_box', {
      p_box_id: boxId,
      p_items: items.map((item) => ({ order_item_id: item.orderItemId, qty: item.qty })),
      p_picks: picks.map((pick) => ({
        order_item_id: pick.orderItemId,
        batches: pick.batches.map((batch) => ({ stock_id: batch.stockId, qty: batch.qty })),
      })),
      p_actor: actorId,
    });
  }
}

/**
 * Kutu kalemleri (`order_box_item`) — **junction tablosu kendi alt sınıfında** (STACK §6).
 *
 * **Yazma yolu YOK ve bu bilinçli** (`order_item_batch`in aynı kararı): satırlar yalnız
 * `seal_order_box` RPC'sinde doğar — kutu içeriği ile parti izi bölünemez bir yazımdır. Buradan
 * tek satır ekleme kapısı açmak o bölünmezliği delen ikinci bir yol olurdu.
 */
export class OrderBoxItemService extends BaseDbService<OrderBoxItem, OrderBoxItemInsert, OrderBoxItemUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'order_box_item', OrderBoxItemSchema, OrderBoxItemInsertSchema, OrderBoxItemUpdateSchema, false);
  }

  /** Kutuların içerikleri tek turda — kuyruk kutu başına tur atmaz. */
  async listByBoxes(boxIds: string[]): Promise<OrderBoxItem[]> {
    if (boxIds.length === 0) return [];
    return this.getAll({ boxId: boxIds });
  }
}
