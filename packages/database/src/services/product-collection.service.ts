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

  /** Bağ ekler/günceller (idempotent). `position` verilmezse DB default'u (0) kalır. */
  async link(collectionId: string, productId: string, position?: number): Promise<void> {
    await this.upsert({ productId, collectionId, position }, 'product_id,collection_id');
  }

  /** Bağı kaldırır. */
  async unlink(collectionId: string, productId: string): Promise<void> {
    await this.deleteWhere({ productId, collectionId });
  }

  /** Koleksiyondaki ürün id'leri — vitrin SIRASINDA (position). */
  async productIdsIn(collectionId: string): Promise<string[]> {
    const rows = await this.getAll({ collectionId }, { orderBy: 'position' });
    return rows.map((row) => row.productId);
  }

  /**
   * Üyeliği verilen listeye EŞİTLER: eksikleri bağlar, fazlaları çözer, kalanların SIRASINI (position)
   * dizideki indekse yazar. Fark alınarak çalışır — "hepsini sil, baştan ekle" yapılmaz; ama sırası
   * değişen mevcut bağlar da güncellenir (upsert), yoksa yeni kürasyon kaybolurdu.
   */
  async setProductsIn(collectionId: string, productIds: string[]): Promise<void> {
    const current = await this.productIdsIn(collectionId);
    const nextSet = new Set(productIds);
    await Promise.all([
      // Sıra listeden gelir: her üye kendi indeksini alır (yeni de olsa, yerinde kalan da olsa).
      ...productIds.map((id, index) => this.link(collectionId, id, index)),
      ...current.filter((id) => !nextSet.has(id)).map((id) => this.unlink(collectionId, id)),
    ]);
  }
}
