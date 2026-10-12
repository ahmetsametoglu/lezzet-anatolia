import type { SupabaseClient } from '@supabase/supabase-js';
import { ProductVatRateInsertSchema, ProductVatRateSchema, type ProductVatRate, type ProductVatRateInsert } from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Ürünün satıcının ülkesi dışındaki KDV oranları (`product_vat_rate`); anahtar `(ürün, ülke)`. Satıcının oranı ürünün kendi alanıdır,
 * Fransa satırını veritabanı reddeder.
 */
export class ProductVatRateService extends BaseDbService<ProductVatRate, ProductVatRateInsert, ProductVatRateInsert> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'product_vat_rate', ProductVatRateSchema, ProductVatRateInsertSchema, ProductVatRateInsertSchema);
  }

  /** Ürün kümesinin ülke oranları; ürün okuması olmayan yerler içindir, liste ve form oranları ürünle birlikte alır (`countryRates`). */
  listByProducts(productIds: readonly string[]): Promise<ProductVatRate[]> {
    return this.getAll({ productId: [...productIds] }, { orderBy: 'country' });
  }

  /** Oranı yazar ya da değiştirir. */
  set(input: ProductVatRateInsert): Promise<ProductVatRate> {
    return this.upsert(input, 'product_id,country');
  }

  /** Oranı kaldırır; o ülkenin tüketicisine ürün satılmaz olur (`sellableIn`). */
  async remove(productId: string, country: ProductVatRate['country']): Promise<void> {
    await this.deleteWhere({ productId, country });
  }
}
