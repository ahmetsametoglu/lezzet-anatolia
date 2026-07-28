import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ProductVariantSchema,
  ProductVariantInsertSchema,
  ProductVariantUpdateSchema,
  resolveLocalizedText,
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

  /**
   * Birden çok ürünün boyları, TEK sorguda — toplu işler için (otomatik fiyat hizalaması).
   * Ürün başına ayrı `listByProduct` çağrısı, katalog boyu kadar gidiş-dönüş demekti.
   */
  async listByProducts(productIds: readonly string[]): Promise<ProductVariant[]> {
    if (productIds.length === 0) return [];
    return this.getAll({ productId: [...productIds] }, { orderBy: 'sortOrder' });
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
      if (!keepIds.has(ex.id)) await this.deleteVariant(ex);
    }

    const result: ProductVariant[] = [];
    for (const [i, e] of entries.entries()) {
      const fields = {
        label: e.label,
        netWeightG: e.netWeightG,
        minStockQty: e.minStockQty,
        sku: e.sku,
        isActive: e.isActive,
        sortOrder: i,
      };
      result.push(e.id ? await this.update({ id: e.id, ...fields }) : await this.insert({ productId, ...fields }));
    }
    return result;
  }

  /**
   * Varyantı siler ve bağlı kayıt yüzünden reddedilirse hatayı OKUNABİLİR hâle getirir.
   *
   * Şema bilerek iki farklı davranıyor (0006/0007/0012/0015): fiyat satırı varyantla birlikte gider
   * (`cascade` — bir boyun fiyatı o boya aittir, yalnız kalamaz), ama stok partisi, rezervasyon,
   * satın alma ve sipariş satırı silmeyi ENGELLER (`restrict` — gerçekleşmiş bir hareketin dayanağı
   * silinemez). Engel doğru; ham FK hatasının operatörün ekranına düşmesi değil: "violates foreign key
   * constraint" cümlesi ne olduğunu da ne yapacağını da söylemiyor.
   */
  private async deleteVariant(variant: ProductVariant): Promise<void> {
    try {
      await this.delete(variant.id);
    } catch (err) {
      const raw = errorText(err);
      if (!/foreign key|violates/i.test(raw)) throw err;
      const name = resolveLocalizedText(variant.label) || variant.sku || 'Varyant';
      throw new Error(
        `«${name}» silinemedi: bu varyanta bağlı ${BLOCKING_RECORDS[matchBlocker(raw)]} var. ` +
          'Gerçekleşmiş hareketin dayanağı silinemez — satışa kapatmak için "Aktif" anahtarını kapatın.',
      );
    }
  }
}

/**
 * Hata metnini çıkarır. `err instanceof Error` YETMEZ: supabase-js reddi `Error` örneği değil, düz
 * bir nesne (`{ message, details, hint, code }`) — örnek denetimiyle bakılınca mesaj okunamıyor ve
 * ham FK hatası kullanıcıya geçip gidiyordu.
 */
function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) return String((err as { message: unknown }).message);
  return String(err);
}

/** Engelleyen tablo → operatörün diliyle ne olduğu. Anahtar, FK adının taşıdığı tablo adıdır. */
const BLOCKING_RECORDS = {
  stock: 'stok partisi',
  reservation: 'rezervasyon',
  purchase: 'satın alma kalemi',
  order: 'sipariş satırı',
  other: 'kayıt',
} as const;

function matchBlocker(message: string): keyof typeof BLOCKING_RECORDS {
  for (const key of ['stock', 'reservation', 'purchase', 'order'] as const) {
    if (message.includes(key)) return key;
  }
  return 'other';
}
