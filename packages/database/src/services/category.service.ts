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
  /**
   * Alt yazı (05.17) — vitrin bandının İKİNCİ satırı. `CollectionService`in `description`'ıyla aynı
   * yerde durur ve simetri bilinçli: ikisi de "adın altındaki cümle"dir, biri yazılabilirken
   * ötekinin yazılamaması bir eksiklikti (kolon ve Zod 05.17'de kondu, yazma yüzeyi unutuldu).
   *
   * **Doğuşta da yazılabilir, sonradan da.** Yalnız `edit()`e koysaydık operatör yeni kategoriyi
   * alt yazısıyla kaydeder, alt yazı sessizce düşer ve ancak müşteri sayfasına bakınca fark ederdi.
   */
  tagline?: LocalizedText | null;
  sortOrder?: number;
  isActive?: boolean;
}

// Düzenlenebilir alanlar — slug YOK (URL korunur). Görsel kırpma künyesi ortak ImageCropFields'ten.
interface EditCategoryInput extends Partial<ImageCropFields> {
  name?: LocalizedText;
  /** Alt yazı — gerekçe `CreateCategoryInput.tagline` künyesinde. `null` = alt yazıyı KALDIR. */
  tagline?: LocalizedText | null;
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
  async list(opts?: { activeOnly?: boolean; featuredOnly?: boolean }): Promise<Category[]> {
    return this.getAll(
      { isActive: opts?.activeOnly ? true : undefined, isFeatured: opts?.featuredOnly ? true : undefined },
      { orderBy: 'sortOrder' },
    );
  }

  /**
   * **Vitrin işareti** (05.18) — "ana sayfada göster" anahtarı.
   *
   * Ayrı bir metot, çünkü ayrı bir KARAR: aktiflik yayın kararıdır (`setActive`), bu vitrin
   * kürasyonudur. İkisini tek `update`'e bırakmak, operasyon ekranında bir anahtarın ötekini
   * habersiz çevirmesine kapı açardı.
   *
   * Sıra YAZILMAZ — `sortOrder` zaten var ve vitrin onu izler (görev satırı 05.18: ikinci bir
   * vitrin sırası tutulmaz, iki sıra bir gün çelişir).
   */
  setFeatured(id: string, isFeatured: boolean): Promise<Category> {
    return this.update({ id, isFeatured });
  }

  /**
   * Yeni kategori; slug addan türetilip benzersizleştirilir. `sortOrder` verilmezse listenin SONUNA
   * eklenir (mevcut sayı) — DB default'u 0 olduğundan aksi hâlde yeni kayıt mevcutların arasına
   * karışır (sıralama sortOrder'a göredir ve eşitlikte sıra belirsizdir).
   */
  async create(input: CreateCategoryInput): Promise<Category> {
    const slug = await uniqueSlugForTable(this.supabase, this.tableName, resolveLocalizedText(input.name));
    const sortOrder = input.sortOrder ?? (await this.count());
    return this.insert({ name: input.name, tagline: input.tagline, slug, sortOrder, isActive: input.isActive });
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
