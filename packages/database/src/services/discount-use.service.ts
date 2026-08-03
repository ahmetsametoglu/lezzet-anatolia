import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DiscountUseInsertSchema,
  DiscountUseSchema,
  DiscountUseUpdateSchema,
  type DiscountUse,
  type DiscountUseInsert,
  type DiscountUseUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Kupon/kampanya KULLANIM kaydı (0031) — kotanın tek kaynağı.
 *
 * `max_uses` ve `per_customer_limit` bir sayaç kolonundan değil BU SATIRLARDAN türetilir
 * (`DiscountService.usageCounts`). Kayıt yazılmazsa motor sınırları doğru uygular ama girdisi hep
 * sıfır olur: kotası dolmuş bir kupon sonsuz haklı görünür. Açık tam olarak buydu — tanım ekranı,
 * sepet kapısı ve motor baştan beri doğruydu, yalnız yazan taraf yoktu (09.6).
 *
 * **Silme kapalı.** Kullanım bir OLAYDIR: olduysa olmuştur. İptal edilen sipariş kotayı geri verir
 * ama bunu satırı silerek değil, SAYARKEN dışlayarak yapar (bkz. `usageCounts`) — silmek "kim ne
 * zaman kullandı" sorusunu geçmişe dönük yanıtsız bırakırdı. Satır yalnız siparişiyle birlikte
 * ölür (`order_id … on delete cascade`).
 */
export class DiscountUseService extends BaseDbService<DiscountUse, DiscountUseInsert, DiscountUseUpdate> {
  /** Kolon `discount_use.amount` (euro numeric); app tarafı cent (STACK §8). */
  protected override readonly moneyFields = ['amountCents'];

  constructor(supabase: SupabaseClient) {
    super(supabase, 'discount_use', DiscountUseSchema, DiscountUseInsertSchema, DiscountUseUpdateSchema, false);
  }

  /**
   * Kullanımı yazar ve kaydın YENİ olup olmadığını söyler.
   *
   * **İdempotent:** aynı (kural, sipariş) ikilisi ikinci kez yazılmaz — çakışma hata değil, `false`.
   * Garanti `discount_use_order_key` tekil indeksinde, uygulamada bir kontrolde değil: checkout'un
   * yeniden denenmesi ya da bir webhook'un iki kez gelmesi kuponun ikinci hakkını yemez.
   */
  async record(input: DiscountUseInsert): Promise<boolean> {
    return (await this.insertIgnoringConflict(input)) !== null;
  }

  /** Bir kuralın kullanım satırları — rapor ve "kim kullandı" okuması. */
  listByDiscount(discountId: string): Promise<DiscountUse[]> {
    return this.getAll({ discountId }, { orderBy: 'usedAt', orderDirection: 'desc' });
  }
}
