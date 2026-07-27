import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CategorySchema,
  CategoryInsertSchema,
  CategoryUpdateSchema,
  resolveLocalizedText,
  type Category,
  type CategoryInsert,
  type CategoryUpdate,
  type ImageCropFields,
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

// Düzenlenebilir alanlar — slug YOK (URL korunur). Görsel kırpma künyesi ortak ImageCropFields'ten.
interface EditCategoryInput extends Partial<ImageCropFields> {
  name?: LocalizedText;
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

  /**
   * Yeni kategori; slug addan türetilip benzersizleştirilir. `sortOrder` verilmezse listenin SONUNA
   * eklenir (mevcut sayı) — DB default'u 0 olduğundan aksi hâlde yeni kayıt mevcutların arasına
   * karışır (sıralama sortOrder'a göredir ve eşitlikte sıra belirsizdir).
   */
  async create(input: CreateCategoryInput): Promise<Category> {
    const slug = await uniqueSlugForTable(this.supabase, this.tableName, resolveLocalizedText(input.name));
    const sortOrder = input.sortOrder ?? (await this.count());
    return this.insert({ name: input.name, slug, sortOrder, isActive: input.isActive });
  }

  /** Aktif/pasif (soft). */
  async setActive(id: string, isActive: boolean): Promise<Category> {
    return this.update({ id, isActive });
  }

  /**
   * Ad, aktiflik ve/veya görsel kırpma künyesi günceller; slug SABİT kalır (URL korunur, addan
   * yeniden türetilmez). Kırpma alanları ortak `ImageCropFields`'ten gelir (tek tip); dosyanın
   * kendisi ayrı yükleme akışında (`setImageKey`).
   */
  async edit(id: string, input: EditCategoryInput): Promise<Category> {
    return this.update({ id, ...input });
  }

  /** Görsel anahtarını + sürüm damgasını yazar (R2 yüklemesinden sonra). Relative key; prefix R2'de. */
  async setImageKey(id: string, imageKey: string): Promise<Category> {
    return this.writeImageKey(id, imageKey);
  }

  /** Sürükle-bırak sırası: verilen id dizisine göre sortOrder'ı 0..n-1 yazar. */
  async reorder(orderedIds: string[]): Promise<void> {
    return this.reorderBy(orderedIds, 'sortOrder');
  }
}
