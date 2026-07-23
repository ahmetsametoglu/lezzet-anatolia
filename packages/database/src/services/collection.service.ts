import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CollectionSchema,
  CollectionInsertSchema,
  CollectionUpdateSchema,
  resolveLocalizedText,
  type Collection,
  type CollectionInsert,
  type CollectionUpdate,
  type LocalizedText,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { uniqueSlugForTable } from '../utils/slug';
import { ProductCollectionService } from './product-collection.service';

// Yeni koleksiyon girişi — slug servis tarafından addan türetilir.
export interface CreateCollectionInput {
  name: LocalizedText;
  sortOrder?: number;
  isActive?: boolean;
}

/**
 * Koleksiyon CRUD — kategoriyle aynı düz/sıralı desen. Ürün↔koleksiyon çoklu bağı
 * (product_collections) Product ile birlikte task 3'te eklenir.
 */
export class CollectionService extends BaseDbService<Collection, CollectionInsert, CollectionUpdate> {
  private readonly links: ProductCollectionService;

  constructor(supabase: SupabaseClient) {
    super(supabase, 'collection', CollectionSchema, CollectionInsertSchema, CollectionUpdateSchema);
    this.links = new ProductCollectionService(supabase);
  }

  /** Sıralı liste; `activeOnly` ile yalnız aktifler. */
  async list(opts?: { activeOnly?: boolean }): Promise<Collection[]> {
    return this.getAll(opts?.activeOnly ? { isActive: true } : undefined, { orderBy: 'sortOrder' });
  }

  /** Yeni koleksiyon; slug addan türetilip benzersizleştirilir. */
  async create(input: CreateCollectionInput): Promise<Collection> {
    const slug = await uniqueSlugForTable(this.supabase, this.tableName, resolveLocalizedText(input.name));
    return this.insert({ name: input.name, slug, sortOrder: input.sortOrder, isActive: input.isActive });
  }

  /** Aktif/pasif (soft). */
  async setActive(id: string, isActive: boolean): Promise<Collection> {
    return this.update({ id, isActive });
  }

  // ── Üyelik (koleksiyon = ürün listesi, DOMAIN §13). product_collections junction servisine devreder. ──

  /** Koleksiyona ürün ekler (idempotent). */
  async addProduct(collectionId: string, productId: string): Promise<void> {
    await this.links.link(collectionId, productId);
  }

  /** Koleksiyondan ürün çıkarır. */
  async removeProduct(collectionId: string, productId: string): Promise<void> {
    await this.links.unlink(collectionId, productId);
  }

  /** Koleksiyondaki ürün id'leri. */
  async productIds(collectionId: string): Promise<string[]> {
    return this.links.productIdsIn(collectionId);
  }
}
