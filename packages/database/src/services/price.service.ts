import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PriceSchema,
  PriceInsertSchema,
  PriceUpdateSchema,
  type Channel,
  type Price,
  type PriceInsert,
  type PriceUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Fiyat okuma ve yazma; satır getirir, "bu müşteri bu varyantı kaça alır" kararı saf motordadır (`resolvePrice`, STACK §4). Tarihli
 * geçerlilikte geçmiş ve en yeni satır kazanır; kanal okumaları yalnız genel satırı (ülkesiz) okur, ülke satırı motora ayrıca verilir.
 */
export class PriceService extends BaseDbService<Price, PriceInsert, PriceUpdate> {
  /** `price.amount` euro `numeric`; app tarafı cent (STACK §8) — dönüşüm taban sınıfta. */
  protected override readonly moneyFields = ['amountCents'];

  constructor(supabase: SupabaseClient) {
    super(supabase, 'price', PriceSchema, PriceInsertSchema, PriceUpdateSchema);
  }

  /** Bir varyantın tüm fiyat satırları (yönetim ekranı) — en yeni önce. */
  async listByVariant(variantId: string): Promise<Price[]> {
    return this.getAll({ variantId }, { orderBy: 'validFrom', orderDirection: 'desc' });
  }

  /**
   * Kanalın geçerli genel liste fiyatı (müşteriye ve ülkeye özel olmayan satır). Yoksa `null` → ürün o kanalda
   * satışa kapalıdır (DOMAIN §5).
   */
  async findChannelPrice(variantId: string, channel: Channel, at: Date = new Date()): Promise<Price | null> {
    const rows = await this.getAll(
      { variantId, channel },
      {
        isNullFields: ['customer_id', 'country'],
        rangeFilters: [{ field: 'valid_from', operator: 'lte', value: at.toISOString() }],
        orderBy: 'validFrom',
        orderDirection: 'desc',
        limit: 1,
      },
    );
    return rows[0] ?? null;
  }

  /** Müşteriye özel geçerli fiyat; yoksa `null` (çağıran kanal fiyatına düşer). */
  async findCustomerPrice(
    variantId: string,
    channel: Channel,
    customerId: string,
    at: Date = new Date(),
  ): Promise<Price | null> {
    const rows = await this.getAll(
      { variantId, channel, customerId },
      {
        rangeFilters: [{ field: 'valid_from', operator: 'lte', value: at.toISOString() }],
        orderBy: 'validFrom',
        orderDirection: 'desc',
        limit: 1,
      },
    );
    return rows[0] ?? null;
  }

  /** Fiyat çözümünün satırları tek turda: kanal listesi ve varsa müşteriye özel fiyat; çağıran bunları `resolvePrice`'a verir. */
  async findApplicable(
    variantId: string,
    channel: Channel,
    customerId?: string | null,
    at: Date = new Date(),
  ): Promise<{ channelPrice: Price | null; customerPrice: Price | null }> {
    const [channelPrice, customerPrice] = await Promise.all([
      this.findChannelPrice(variantId, channel, at),
      customerId ? this.findCustomerPrice(variantId, channel, customerId, at) : Promise.resolve(null),
    ]);
    return { channelPrice, customerPrice };
  }

  /**
   * `findApplicable`'ın toplu hâli: varyant başına sorgu yerine iki sorgu (kanal ve müşteriye özel). Her varyantın en yeni geçerli
   * satırı kazanır; `limit` varyant başına değil tüm sonuca uygulandığı için azalan sıradaki ilk satır alınır.
   */
  async findApplicableMap(
    variantIds: string[],
    channel: Channel,
    customerId?: string | null,
    at: Date = new Date(),
  ): Promise<Map<string, { channelPrice: Price | null; customerPrice: Price | null }>> {
    const result = new Map<string, { channelPrice: Price | null; customerPrice: Price | null }>();
    if (!variantIds.length) return result;

    const validUntilNow = [{ field: 'valid_from', operator: 'lte' as const, value: at.toISOString() }];
    const [channelRows, customerRows] = await Promise.all([
      this.getAll(
        { variantId: variantIds, channel },
        { isNullFields: ['customer_id', 'country'], rangeFilters: validUntilNow, orderBy: 'validFrom', orderDirection: 'desc' },
      ),
      customerId
        ? this.getAll(
            { variantId: variantIds, channel, customerId },
            { rangeFilters: validUntilNow, orderBy: 'validFrom', orderDirection: 'desc' },
          )
        : Promise.resolve([] as Price[]),
    ]);

    // Sıra azalan olduğu için varyantın İLK görülen satırı en yenisidir.
    const newestByVariant = (rows: Price[]): Map<string, Price> => {
      const map = new Map<string, Price>();
      for (const row of rows) if (!map.has(row.variantId)) map.set(row.variantId, row);
      return map;
    };
    const channelMap = newestByVariant(channelRows);
    const customerMap = newestByVariant(customerRows);

    for (const variantId of variantIds) {
      result.set(variantId, {
        channelPrice: channelMap.get(variantId) ?? null,
        customerPrice: customerMap.get(variantId) ?? null,
      });
    }
    return result;
  }

  /**
   * Fiyat belirler/günceller — yeni bir satır YAZAR, mevcut satırı değiştirmez. Fiyat geçmişi
   * korunur: eski siparişlerin hangi listeden çıktığı sonradan görülebilir, `valid_from` ileri
   * tarihli verilerek zam önceden planlanabilir.
   */
  async setPrice(input: PriceInsert): Promise<Price> {
    return this.insert(input);
  }

  /**
   * Müşteriye özel fiyatı kaldırır: (varyant, kanal, müşteri) üçlüsünün tüm satırlarını siler. Tek satır silinseydi altındaki eski
   * özel fiyat yeniden yürürlüğe girerdi; anlaşmanın izi siparişin kalemindedir.
   */
  async removeCustomerPrice(variantId: string, channel: Channel, customerId: string): Promise<void> {
    await this.deleteWhere({ variantId, channel, customerId });
  }

  /**
   * Şu an geçerli müşteriye özel fiyatlar, (varyant, kanal, müşteri) başına en yeni satır; tablo geçmiş taşıdığı için tekilleştirilir.
   * Sayfalanmaz, çünkü küme veriyle değil yöneticinin pazarlıklarıyla büyür (CLAUDE.md §1).
   */
  async listCustomerPricesNow(at: Date = new Date()): Promise<Price[]> {
    const rows = await this.getAll(
      {},
      {
        isNotNullFields: ['customer_id'],
        rangeFilters: [{ field: 'valid_from', operator: 'lte', value: at.toISOString() }],
        orderBy: 'validFrom',
        orderDirection: 'desc',
      },
    );
    const newest = new Map<string, Price>();
    for (const row of rows) {
      const key = `${row.variantId}·${row.channel}·${row.customerId}`;
      if (!newest.has(key)) newest.set(key, row);
    }
    return [...newest.values()];
  }
}
