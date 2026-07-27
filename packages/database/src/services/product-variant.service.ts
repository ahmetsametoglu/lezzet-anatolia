import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ProductVariantSchema,
  ProductVariantInsertSchema,
  ProductVariantUpdateSchema,
  type ProductVariant,
  type ProductVariantEntry,
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

  /**
   * Verilen varyantlar TEK sorguda. Varyanttan ürüne çıkmak gerektiğinde kullanılır: teklife açık
   * partiler varyant kimliği taşır, vitrin ise ürün gösterir — bu okuma o köprüdür.
   */
  async listByIds(ids: string[]): Promise<ProductVariant[]> {
    if (ids.length === 0) return [];
    return this.getAll({ id: ids }, { orderBy: 'sortOrder' });
  }

  /** Aktif/pasif (soft). */
  async setActive(id: string, isActive: boolean): Promise<ProductVariant> {
    return this.update({ id, isActive });
  }

  /**
   * Formdan gelen varyant listesini ürüne senkronlar: `id`'li satır güncellenir, id'siz satır eklenir,
   * mevcutta olup listede olmayan satır silinir. sortOrder liste sırasından yazılır. Boş liste GELİRSE
   * dokunmaz (kazara tüm varyantları silmeyi önler; UI son varyantın silinmesini engeller).
   */
  async syncVariants(productId: string, entries: ProductVariantEntry[]): Promise<ProductVariant[]> {
    if (entries.length === 0) return this.listByProduct(productId);

    const existing = await this.listByProduct(productId);
    const keepIds = new Set(entries.filter((e) => e.id).map((e) => e.id));
    for (const ex of existing) {
      if (!keepIds.has(ex.id)) await this.delete(ex.id);
    }

    const result: ProductVariant[] = [];
    for (const [i, e] of entries.entries()) {
      const fields = { label: e.label, netWeightG: e.netWeightG, sku: e.sku, isActive: e.isActive, sortOrder: i };
      result.push(e.id ? await this.update({ id: e.id, ...fields }) : await this.insert({ productId, ...fields }));
    }
    return result;
  }
}
