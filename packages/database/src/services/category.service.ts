import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CategorySchema,
  CategoryInsertSchema,
  CategoryUpdateSchema,
  resolveLocalizedText,
  type Category,
  type CategoryInsert,
  type CategoryUpdate,
  type LocalizedText,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { uniqueSlugForTable } from '../utils/slug';

// Yeni kategori girişi — slug servis tarafından addan (TR→FR→DE) türetilir; çağıran vermez.
export interface CreateCategoryInput {
  name: LocalizedText;
  sortOrder?: number;
  isActive?: boolean;
}

/**
 * Kategori CRUD — düz liste, sıralı. slug addan türetilip tablo genelinde benzersizleştirilir;
 * rename'de slug SABİT kalır (URL korunur). Aktif/pasif soft-durum (silme yerine tercih edilir).
 */
export class CategoryService extends BaseDbService<Category, CategoryInsert, CategoryUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'category', CategorySchema, CategoryInsertSchema, CategoryUpdateSchema);
  }

  /** Sıralı liste; `activeOnly` ile yalnız aktifler (vitrin okuması). */
  async list(opts?: { activeOnly?: boolean }): Promise<Category[]> {
    return this.getAll(opts?.activeOnly ? { isActive: true } : undefined, { orderBy: 'sortOrder' });
  }

  /** Yeni kategori; slug addan türetilip benzersizleştirilir. */
  async create(input: CreateCategoryInput): Promise<Category> {
    const slug = await uniqueSlugForTable(this.supabase, this.tableName, resolveLocalizedText(input.name));
    return this.insert({ name: input.name, slug, sortOrder: input.sortOrder, isActive: input.isActive });
  }

  /** Aktif/pasif (soft). */
  async setActive(id: string, isActive: boolean): Promise<Category> {
    return this.update({ id, isActive });
  }

  /** Ad ve/veya aktiflik günceller; slug SABİT kalır (URL korunur, addan yeniden türetilmez). */
  async edit(id: string, input: { name?: LocalizedText; isActive?: boolean }): Promise<Category> {
    return this.update({ id, ...input });
  }

  /** Sürükle-bırak sırası: verilen id dizisine göre sortOrder'ı 0..n-1 yazar. */
  async reorder(orderedIds: string[]): Promise<void> {
    return this.reorderBy(orderedIds, 'sortOrder');
  }
}
