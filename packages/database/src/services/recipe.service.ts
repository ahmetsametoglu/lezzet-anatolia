import type { SupabaseClient } from '@supabase/supabase-js';
import {
  RecipeSchema,
  RecipeInsertSchema,
  RecipeUpdateSchema,
  RecipeWithItemsSchema,
  resolveLocalizedText,
  type Recipe,
  type RecipeInsert,
  type RecipeItemEntry,
  type RecipeUpdate,
  type RecipeWithItems,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { uniqueSlugForTable } from '../utils/slug';
import { RecipeItemService } from './recipe-item.service';

/**
 * TARİF servisi (05.16) — "Sofradan Fikirler".
 *
 * ⚠ **Karar VERMEZ** (`STACK §4`): malzeme toplamı, tükenen kalem, persona fiyatı ve depo süzgeci
 * burada YOKTUR. Fiyat personaya (B2B toptan) ve depoya bağlıdır; saklanan ya da serviste
 * hesaplanan bir toplam ilk gün yalan söyler. O birleştirme uygulama katmanının işi
 * (`apps/web/lib/storefront`), tıpkı vitrin okumaları gibi ve **aynı depo süzgecinden geçerek** —
 * süzgeci unutulan sorgu tek depolu veride DOĞRU cevap verir ve sistem sessizce olmayan malı satar
 * (`DOMAIN §17`).
 */
export type CreateRecipeInput = Omit<RecipeInsert, 'slug'> & { items?: readonly RecipeItemEntry[] };

export class RecipeService extends BaseDbService<Recipe, RecipeInsert, RecipeUpdate> {
  private readonly items: RecipeItemService;

  constructor(supabase: SupabaseClient) {
    super(supabase, 'recipe', RecipeSchema, RecipeInsertSchema, RecipeUpdateSchema);
    this.items = new RecipeItemService(supabase);
  }

  /** Operasyon listesi — taslak/yayın hepsi, editoryal sırada. */
  async listAll(): Promise<Recipe[]> {
    return this.getAll(undefined, { orderBy: 'sortOrder' });
  }

  /**
   * Vitrin okuması: **yalnız yayındakiler, sıralı ve SINIRLI.**
   *
   * Sayfalama yok ama sabit sınır var (`CLAUDE §1`): mobil ana ekrandaki "Sofradan Fikirler" şeridi
   * bir editoryal seçkidir, liste değil — tıklatma davetidir. Sınırsız çekmek, kimsenin görmeyeceği
   * satırları her açılışta taşımak olurdu.
   */
  async listActive(limit = 12): Promise<Recipe[]> {
    return this.getAll({ isActive: true }, { orderBy: 'sortOrder', limit });
  }

  /**
   * Operasyon listesi + kalemleri TEK sorguda — `listAll`ın kalemli ikizi (09.21 talebi).
   *
   * Neden `listAll` yetmiyordu: liste ekranının "Malzeme" sütunu kalem SAYISINI istiyor ve o sayı
   * tarif başına ayrı sorguyla toplansaydı liste boyunca N+1 olurdu — `listActiveWithItems`in
   * künyesinde zaten reddedilen şey. `listActiveWithItems` de yetmiyordu: operasyon listesinin
   * yarısı taslak, o ise yalnız yayındakileri getiriyor.
   *
   * **Sayfalama YOK ve bu bilinçli** (`CLAUDE §1`): tarif kümesi operatörün elle kurduğu editoryal
   * bir seçki, veriyle büyümüyor. Sınır da yok — vitrindeki şeritten farkı bu: orada seçki
   * gösteriliyor, burada envanter yönetiliyor.
   */
  async listAllWithItems(): Promise<RecipeWithItems[]> {
    return this.getAllAs(RecipeWithItemsSchema, undefined, { select: '*,items:recipe_item(*)', orderBy: 'sortOrder' });
  }

  /** Tarifler + kalemleri TEK sorguda — kalem başına ayrı sorgu liste boyunca N+1 doğururdu. */
  async listActiveWithItems(limit = 12): Promise<RecipeWithItems[]> {
    return this.getAllAs(RecipeWithItemsSchema, { isActive: true }, {
      select: '*,items:recipe_item(*)',
      orderBy: 'sortOrder',
      limit,
    });
  }

  /** Detay sayfası — slug dil-bağımsızdır, dış URL'in dil farkı `routing.ts`'ten gelir. */
  async findBySlugWithItems(slug: string): Promise<RecipeWithItems | null> {
    const rows = await this.getAllAs(RecipeWithItemsSchema, { slug }, { select: '*,items:recipe_item(*)', limit: 1 });
    return rows[0] ?? null;
  }

  /**
   * Tarifi kalemleriyle birlikte açar.
   *
   * **Slug addan TÜRETİLİR ve operatörden istenmez** (emsal paket/ürün): tarif adı üç dilde yazılır,
   * slug tektir; hangi dilden türeyeceği bir karardır ve yedek zinciri (TR→FR→DE) onu tek yerde
   * veriyor. Operatöre sormak, aynı tarifin iki kez farklı slug'la açılmasına kapı açardı.
   */
  async createWithItems(input: CreateRecipeInput): Promise<RecipeWithItems> {
    const { items, ...fields } = input;
    const slug = await uniqueSlugForTable(this.supabase, 'recipe', resolveLocalizedText(fields.name) ?? 'tarif');
    const recipe = await this.insert({ ...fields, slug });
    const saved = items?.length ? await this.items.syncItems(recipe.id, items) : [];
    return { ...recipe, items: saved };
  }

  /**
   * Tarifin alanlarını ve kalemlerini birlikte yazar.
   *
   * İkisi TEK çağrıda çünkü operatör diyaloğu ikisini birlikte kaydediyor; ayrı çağrılar yarım bir
   * ara hâl bırakırdı (metin güncellendi, malzemeler eski). `items` verilmezse kalemlere
   * DOKUNULMAZ — yalnız sıra ya da yayın durumu değiştiren çağrı malzemeleri silmemeli.
   */
  async updateWithItems(input: RecipeUpdate & { items?: readonly RecipeItemEntry[] }): Promise<RecipeWithItems> {
    const { items, ...fields } = input;
    const recipe = await this.update(fields);
    const saved = items ? await this.items.syncItems(recipe.id, items) : await this.items.listByRecipe(recipe.id);
    return { ...recipe, items: saved };
  }
}
