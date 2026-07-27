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
 * Fiyat CRUD + okuma (05.4). Fiyat varyant seviyesindedir; aynı tablo kanal listesini
 * (customerId boş) ve müşteriye özel fiyatı (customerId dolu) taşır.
 *
 * **Bu servis KARAR VERMEZ, satır getirir.** "Bu müşteri bu varyantı kaça alır" kararı saf
 * motordadır (`domain-core/pricing.resolvePrice`) — `database` katmanı `domain-core`'a bağlanmaz
 * (STACK §4). Çağıran katman satırları buradan alır, kararı motora sorar. Çağıran sayısı arttığında
 * (vitrin + WhatsApp + admin) bu birleştirme tek bir orkestrasyon noktasına taşınır.
 *
 * Tarihli geçerlilik: aynı (varyant, kanal, müşteri) için birden çok satır olabilir; **geçmiş ve
 * en yeni** kazanır. Gelecek tarihli satır, fiyat değişimini önceden hazırlamak içindir.
 */
export class PriceService extends BaseDbService<Price, PriceInsert, PriceUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'price', PriceSchema, PriceInsertSchema, PriceUpdateSchema);
  }

  /** Bir varyantın tüm fiyat satırları (yönetim ekranı) — en yeni önce. */
  async listByVariant(variantId: string): Promise<Price[]> {
    return this.getAll({ variantId }, { orderBy: 'validFrom', orderDirection: 'desc' });
  }

  /**
   * Kanalın geçerli liste fiyatı (müşteriye özel olmayan satır). Yoksa `null` → ürün o kanalda
   * satışa kapalıdır (DOMAIN §5).
   */
  async findChannelPrice(variantId: string, channel: Channel, at: Date = new Date()): Promise<Price | null> {
    const rows = await this.getAll(
      { variantId, channel },
      {
        isNullFields: ['customer_id'],
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

  /**
   * Fiyat çözümünün ihtiyaç duyduğu satırları TEK turda getirir: kanal listesi + (varsa) müşteriye
   * özel fiyat. Çağıran bunları `resolvePrice`'a verir. İki ayrı sorgu yerine tek yol olması,
   * vitrin listelerinde N+1'i önler.
   */
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
   * Fiyat belirler/günceller — yeni bir satır YAZAR, mevcut satırı değiştirmez. Fiyat geçmişi
   * korunur: eski siparişlerin hangi listeden çıktığı sonradan görülebilir, `valid_from` ileri
   * tarihli verilerek zam önceden planlanabilir.
   */
  async setPrice(input: PriceInsert): Promise<Price> {
    return this.insert(input);
  }
}
