import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ProductVariantSchema,
  ProductVariantInsertSchema,
  ProductVariantUpdateSchema,
  type ProductVariant,
  type ProductVariantInsert,
  type ProductVariantUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Ürün varyantı (satılabilir birim) CRUD. Oluşturma genelde ProductService.create içinden
 * (varsayılan varyant otomatik); ayrıca ürüne yeni varyant eklemek için doğrudan da kullanılır.
 */
export class ProductVariantService extends BaseDbService<ProductVariant, ProductVariantInsert, ProductVariantUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'product_variant', ProductVariantSchema, ProductVariantInsertSchema, ProductVariantUpdateSchema);
  }

  /** Bir ürünün varyantları, sıralı. */
  async listByProduct(productId: string): Promise<ProductVariant[]> {
    return this.getAll({ productId }, { orderBy: 'sortOrder' });
  }

  /** Aktif/pasif (soft). */
  async setActive(id: string, isActive: boolean): Promise<ProductVariant> {
    return this.update({ id, isActive });
  }
}
