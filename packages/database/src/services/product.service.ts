import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ProductSchema,
  ProductInsertSchema,
  ProductUpdateSchema,
  resolveLocalizedText,
  type Product,
  type ProductInsert,
  type ProductUpdate,
  type ProductVariant,
  type LocalizedText,
  type ProductDateType,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { uniqueSlugForTable } from '../utils/slug';
import { ProductVariantService } from './product-variant.service';

// Varyantsız üründe otomatik açılan tek varyantın etiketi (müşteriye gösterilmez — seçici gizli).
const DEFAULT_VARIANT_LABEL = 'default';

// Yeni varyant girişi (ProductService.create içinden).
export interface CreateVariantInput {
  label: string;
  netWeightG?: number | null;
  minStockQty?: number | null;
  sku?: string | null;
  sortOrder?: number;
}

// Yeni ürün girişi — slug servis türetir. `variants` boşsa varsayılan varyant otomatik açılır.
export interface CreateProductInput {
  name: LocalizedText;
  description?: LocalizedText | null;
  categoryId?: string | null;
  imageKey?: string | null;
  vatRate?: number;
  dateType?: ProductDateType;
  shelfLifeDays?: number | null;
  shippable?: boolean;
  isCandidate?: boolean;
  isActive?: boolean;
  sortOrder?: number;
  variants?: CreateVariantInput[];
}

/**
 * Ürün CRUD + varyant orkestrasyonu + koleksiyon bağı. Satılabilir birim her zaman varyant
 * olduğundan varyantsız üründe otomatik varsayılan varyant açılır. Aday ürün (is_candidate)
 * satış/vitrin sorgularının dışında (DOMAIN §13).
 */
export class ProductService extends BaseDbService<Product, ProductInsert, ProductUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'product', ProductSchema, ProductInsertSchema, ProductUpdateSchema);
  }

  /** Satılabilir katalog: aktif + aday DEĞİL (aday yalnız keşifte). */
  async listSellable(): Promise<Product[]> {
    return this.getAll({ isActive: true, isCandidate: false }, { orderBy: 'sortOrder' });
  }

  /** Aday ürünler (keşif/tinder bölümü). */
  async listCandidates(): Promise<Product[]> {
    return this.getAll({ isCandidate: true }, { orderBy: 'sortOrder' });
  }

  /**
   * Ürün + varyantlarını oluşturur. `variants` verilmezse varsayılan tek varyant açılır
   * (fiyat/stok mantığı her yerde varyant üzerinden çalışsın diye).
   */
  async create(input: CreateProductInput): Promise<{ product: Product; variants: ProductVariant[] }> {
    const { variants, ...productFields } = input;
    const slug = await uniqueSlugForTable(this.supabase, this.tableName, resolveLocalizedText(input.name));
    const product = await this.insert({ ...productFields, slug });

    const variantSvc = new ProductVariantService(this.supabase);
    const toCreate: CreateVariantInput[] = variants && variants.length > 0 ? variants : [{ label: DEFAULT_VARIANT_LABEL }];
    const created: ProductVariant[] = [];
    for (const [i, v] of toCreate.entries()) {
      created.push(await variantSvc.insert({ ...v, productId: product.id, sortOrder: v.sortOrder ?? i }));
    }
    return { product, variants: created };
  }

  /** Aktif/pasif (soft). */
  async setActive(id: string, isActive: boolean): Promise<Product> {
    return this.update({ id, isActive });
  }
}
