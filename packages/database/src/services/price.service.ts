import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PriceSchema,
  PriceInsertSchema,
  PriceUpdateSchema,
  type Channel,
  type Country,
  type Price,
  type PriceInsert,
  type PriceUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/** Bir kanal listesinin genel ve ülke satırları ayrı; ülkenin satırı yoksa anahtarı da yoktur ve o ülkede genel satır geçer. */
export interface ChannelListPrices {
  general: Price | null;
  byCountry: Partial<Record<Country, Price>>;
}

/**
 * Fiyat okuma ve yazma; satır getirir, "bu müşteri bu varyantı kaça alır" kararı saf motordadır (`resolvePrice`, STACK §4). Tarihli
 * geçerlilikte geçmiş ve en yeni satır kazanır; ülkesiz okuma yalnız genel satırı görür.
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
        rangeFilters: validUntil(at),
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
        rangeFilters: validUntil(at),
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
   * `findApplicable`'ın toplu hâli: varyant başına sorgu yerine iki sorgu (kanal ve müşteriye özel). `country` verilirse kanal fiyatı o
   * ülkenin satırıdır, yoksa genel satır; ülke satırı tarihine bakılmadan genel satırın yerine geçer, motordaki kuralla aynı.
   */
  async findApplicableMap(
    variantIds: string[],
    channel: Channel,
    customerId?: string | null,
    at: Date = new Date(),
    country: Country | null = null,
  ): Promise<Map<string, { channelPrice: Price | null; customerPrice: Price | null }>> {
    const result = new Map<string, { channelPrice: Price | null; customerPrice: Price | null }>();
    if (!variantIds.length) return result;

    const [lists, customerRows] = await Promise.all([
      this.listPrices(variantIds, channel, at, country),
      customerId
        ? this.getAll(
            { variantId: variantIds, channel, customerId },
            { rangeFilters: validUntil(at), orderBy: 'validFrom', orderDirection: 'desc' },
          )
        : Promise.resolve([] as Price[]),
    ]);
    const customerMap = new Map<string, Price>();
    for (const row of customerRows) if (!customerMap.has(row.variantId)) customerMap.set(row.variantId, row);

    for (const variantId of variantIds) {
      const list = lists.get(variantId);
      result.set(variantId, {
        channelPrice: (country ? list?.byCountry[country] : undefined) ?? list?.general ?? null,
        customerPrice: customerMap.get(variantId) ?? null,
      });
    }
    return result;
  }

  /** Kanal listesinin genel ve ülke satırları ayrı, her varyant için; operasyon hücresi ülke satırı yokken genel fiyatı gösterir. */
  async findListPricesMap(variantIds: readonly string[], channel: Channel, at: Date = new Date()): Promise<Map<string, ChannelListPrices>> {
    const lists = await this.listPrices(variantIds, channel, at);
    return new Map(variantIds.map((variantId) => [variantId, lists.get(variantId) ?? { general: null, byCountry: {} }]));
  }

  /**
   * Varyantların geçerli liste satırları, varyant başına genel ve ülke ayrı en yenisi; `country` yoksa bütün ülkeler, `null` yalnız genel
   * satır. Sıra azalan olduğu için ilk görülen satır en yenisidir.
   */
  private async listPrices(
    variantIds: readonly string[],
    channel: Channel,
    at: Date,
    country?: Country | null,
  ): Promise<Map<string, ChannelListPrices>> {
    const rows = await this.getAll(
      { variantId: [...variantIds], channel },
      {
        isNullFields: country === null ? ['customer_id', 'country'] : ['customer_id'],
        orFilters: country ? [`country.is.null,country.eq.${country}`] : undefined,
        rangeFilters: validUntil(at),
        orderBy: 'validFrom',
        orderDirection: 'desc',
      },
    );
    const lists = new Map<string, ChannelListPrices>();
    for (const row of rows) {
      const list = lists.get(row.variantId) ?? { general: null, byCountry: {} };
      if (row.country === null) list.general ??= row;
      else list.byCountry[row.country] ??= row;
      lists.set(row.variantId, list);
    }
    return lists;
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

  /** Ülke fiyatını kaldırır: (varyant, kanal, ülke) üçlüsünün tüm satırları gider, yoksa altındaki eski ülke fiyatı yürürlüğe girerdi. */
  async removeCountryPrice(variantId: string, channel: Channel, country: Country): Promise<void> {
    await this.deleteWhere({ variantId, channel, country });
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
        rangeFilters: validUntil(at),
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

function validUntil(at: Date) {
  return [{ field: 'valid_from', operator: 'lte' as const, value: at.toISOString() }];
}
