import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ProductCollectionRowSchema,
  ProductCollectionInsertSchema,
  ProductCollectionUpdateSchema,
  type ProductCollectionRow,
  type ProductCollectionInsert,
  type ProductCollectionUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Ürün↔koleksiyon bağı (product_collections). Bileşik PK — base'in upsert/deleteWhere/getAll
 * metodlarını kullanır (ham `this.supabase` sorgusu YOK; StaffRole deseni). Üyelik API'si
 * CollectionService'te (koleksiyon = ürün listesi); orası bu servise devreder.
 */
export class ProductCollectionService extends BaseDbService<ProductCollectionRow, ProductCollectionInsert, ProductCollectionUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'product_collections', ProductCollectionRowSchema, ProductCollectionInsertSchema, ProductCollectionUpdateSchema);
  }

  /** Bağ ekler (idempotent). */
  async link(collectionId: string, productId: string): Promise<void> {
    await this.upsert({ productId, collectionId }, 'product_id,collection_id');
  }

  /** Bağı kaldırır. */
  async unlink(collectionId: string, productId: string): Promise<void> {
    await this.deleteWhere({ productId, collectionId });
  }

  /** Koleksiyondaki ürün id'leri. */
  async productIdsIn(collectionId: string): Promise<string[]> {
    const rows = await this.getAll({ collectionId });
    return rows.map((row) => row.productId);
  }

  /**
   * Üyeliği verilen listeye EŞİTLER: eksikleri bağlar, fazlaları çözer. Fark alınarak çalışır —
   * "hepsini sil, baştan ekle" yapılmaz (dokunulmayan bağların kimliği/zaman damgası korunur).
   */
  async setProductsIn(collectionId: string, productIds: string[]): Promise<void> {
    const current = await this.productIdsIn(collectionId);
    const currentSet = new Set(current);
    const nextSet = new Set(productIds);
    await Promise.all([
      ...productIds.filter((id) => !currentSet.has(id)).map((id) => this.link(collectionId, id)),
      ...current.filter((id) => !nextSet.has(id)).map((id) => this.unlink(collectionId, id)),
    ]);
  }
}
