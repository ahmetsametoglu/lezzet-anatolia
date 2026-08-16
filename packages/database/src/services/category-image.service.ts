import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CategoryImageSchema,
  CategoryImageInsertSchema,
  CategoryImageUpdateSchema,
  type CategoryImage,
  type CategoryImageInsert,
  type CategoryImageUpdate,
} from '@lezzet/types';
import { GalleryDbService } from '../core/gallery.service';

/**
 * Kategori fotoğraf HAVUZU (05.23) — kartın gün gün değiştirdiği kareler. Kapak bu tabloda DEĞİL
 * (`category.image_key`), ürün galerisiyle aynı gerekçe: kartı çizen okuma kategoriyi zaten satır
 * olarak alıyor, kapak için ikinci bir sorgu doğmasın.
 *
 * Davranış ortak tabandan (`GalleryDbService`); burada eklenen tek şey **toplu okuma**, ve o da
 * kullanım farkından doğuyor: ürün galerisi tek ürünün detay sayfasında okunur (bir kategori →
 * bir sorgu yeter), kategori havuzu ise vitrinde ALTI kart için birden gerekir. Kart başına sorgu
 * yazılsaydı ana sayfa altı ek tur atardı (`STACK §13` — N+1).
 */
export class CategoryImageService extends GalleryDbService<CategoryImage, CategoryImageInsert, CategoryImageUpdate> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'category_image',
      'categoryId',
      CategoryImageSchema,
      CategoryImageInsertSchema,
      CategoryImageUpdateSchema,
    );
  }

  /** Bir kategorinin havuzu, rotasyonun döngü sırasında. */
  listByCategory(categoryId: string): Promise<CategoryImage[]> {
    return this.listByParent(categoryId);
  }

  /** Havuzun sonuna yeni fotoğraf. */
  add(categoryId: string, imageKey: string): Promise<CategoryImage> {
    return this.addPhoto(categoryId, imageKey);
  }

  /**
   * Birden çok kategorinin havuzu — TEK turda, kategori kimliğine göre gruplu.
   *
   * Havuzu olmayan kategori haritada HİÇ GÖRÜNMEZ (boş dizi ile de değil): okuyan taraf zaten
   * `?? []` ile karşılıyor ve "kaydı yok" ile "havuzu boş" arasında bir fark yok — ikisinde de kart
   * kapağa düşer.
   */
  async listByCategories(categoryIds: readonly string[]): Promise<Map<string, CategoryImage[]>> {
    const rows = await this.listByParent(categoryIds);
    const byCategory = new Map<string, CategoryImage[]>();
    for (const row of rows) {
      const pool = byCategory.get(row.categoryId);
      if (pool) pool.push(row);
      else byCategory.set(row.categoryId, [row]);
    }
    return byCategory;
  }
}
