import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ProductImageSchema,
  ProductImageInsertSchema,
  ProductImageUpdateSchema,
  type ImageCropFields,
  type ProductImage,
  type ProductImageInsert,
  type ProductImageUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Ürün galerisi — detay sayfasındaki EK fotoğraflar. Kapak bu tabloda DEĞİL (`product.image_key`);
 * kapağı galeriye almak / galeriden kapak yapmak iki tabloya birden dokunduğu için orkestrasyon
 * `ProductService.makeCover`'da (tek yerde, iki servis birlikte).
 */
export class ProductImageService extends BaseDbService<ProductImage, ProductImageInsert, ProductImageUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'product_image', ProductImageSchema, ProductImageInsertSchema, ProductImageUpdateSchema);
  }

  /** Bir ürünün galerisi, müşteriye gösterilecek sırada. */
  async listByProduct(productId: string): Promise<ProductImage[]> {
    return this.getAll({ productId }, { orderBy: 'sortOrder' });
  }

  /**
   * Yeni fotoğrafı galerinin SONUNA ekler (yükleme sırası = ilk sıra beklentisi). Sürüm damgası
   * dosyayla birlikte yazılır — public okuma URL'i `?v=` ile sürümlenir (bkz. `publicImageUrl`).
   */
  async add(productId: string, imageKey: string): Promise<ProductImage> {
    const sortOrder = await this.count({ productId });
    return this.insert({ productId, imageKey, sortOrder, imageUpdatedAt: new Date().toISOString() });
  }

  /** Odak/zoom yazar — dosya değişmediği için sürüm damgasına DOKUNMAZ (kırpma CSS'te uygulanır). */
  async setCrop(id: string, crop: ImageCropFields): Promise<ProductImage> {
    return this.update({ id, ...crop });
  }

  /** Sürükle-bırak sırası: verilen id dizisine göre sortOrder'ı 0..n-1 yazar. */
  async reorder(orderedIds: string[]): Promise<void> {
    return this.reorderBy(orderedIds, 'sortOrder');
  }
}
