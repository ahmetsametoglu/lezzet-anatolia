import type { SupabaseClient } from '@supabase/supabase-js';
import {
  RecipeItemSchema,
  RecipeItemInsertSchema,
  RecipeItemUpdateSchema,
  type RecipeItem,
  type RecipeItemEntry,
  type RecipeItemInsert,
  type RecipeItemUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Tarif kalemi — junction tablosu, kendi alt sınıfı (`STACK §6`).
 *
 * Kalem yalnız BİZİM ürünümüzü taşır; tuz/su gibi ev malzemesi `recipe.pantry` metnindedir.
 * Satılmayan bir şeye satır açmak onu sepete eklenebilirmiş gibi gösterirdi.
 */
export class RecipeItemService extends BaseDbService<RecipeItem, RecipeItemInsert, RecipeItemUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'recipe_item', RecipeItemSchema, RecipeItemInsertSchema, RecipeItemUpdateSchema);
  }

  /** Bir tarifin kalemleri, müşteriye gösterilecek sırada. */
  async listByRecipe(recipeId: string): Promise<RecipeItem[]> {
    return this.getAll({ recipeId }, { orderBy: 'sortOrder' });
  }

  /**
   * Bir varyantın geçtiği tarif kalemleri — **varyant silinemediğinde sebebi göstermek için.**
   *
   * `recipe_item.variant_id` FK'si `restrict`: tarifte duran varyant silinemez. Sebebi
   * söyleyemeseydik operatör "silinmiyor" diyen bir hatayla baş başa kalırdı; hangi tarifte
   * geçtiğini bilirse tarifi düzeltip tekrar dener.
   */
  async listByVariant(variantId: string): Promise<RecipeItem[]> {
    return this.getAll({ variantId }, { orderBy: 'sortOrder' });
  }

  /**
   * Formdan gelen kalem listesini tarife senkronlar (varyant editörünün deseni): `id`'li satır
   * güncellenir, id'siz eklenir, mevcutta olup listede olmayan silinir. `sortOrder` liste
   * sırasından yazılır — o sıra müşterinin malzeme listesinde gördüğü sıradır.
   *
   * **BOŞ liste kalemleri SİLER ve bu tarifte kabul edilebilir:** malzemesiz tarif geçici olarak
   * olabilir (operatör hepsini çıkarıp yeniden kurar) ve yayın kısıtı zaten metin alanlarına bakar.
   * Kalemsiz bir tarifin müşteriye ne anlattığı EKRANIN kararı: "malzemeleri sepete ekle" bloğu
   * hiç çizilmez, tarif yine okunur.
   *
   * Aynı varyant iki kez gelirse **DB reddeder** (`unique(recipe_id, variant_id)`) — "iki tane"
   * demek adet artırmaktır, ikinci satır açmak değil.
   */
  async syncItems(recipeId: string, entries: readonly RecipeItemEntry[]): Promise<RecipeItem[]> {
    const existing = await this.listByRecipe(recipeId);
    const keepIds = new Set(entries.filter((e) => e.id).map((e) => e.id));
    for (const ex of existing) {
      if (!keepIds.has(ex.id)) await this.delete(ex.id);
    }

    const result: RecipeItem[] = [];
    for (const [i, e] of entries.entries()) {
      const fields = { variantId: e.variantId, qty: e.qty, sortOrder: i };
      result.push(e.id ? await this.update({ id: e.id, ...fields }) : await this.insert({ recipeId, ...fields }));
    }
    return result;
  }
}
