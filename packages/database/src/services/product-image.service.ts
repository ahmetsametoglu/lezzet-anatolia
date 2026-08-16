import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ProductImageSchema,
  ProductImageInsertSchema,
  ProductImageUpdateSchema,
  type ProductImage,
  type ProductImageInsert,
  type ProductImageUpdate,
} from '@lezzet/types';
import { GalleryDbService } from '../core/gallery.service';

/**
 * Ürün galerisi — detay sayfasındaki EK fotoğraflar. Kapak bu tabloda DEĞİL (`product.image_key`);
 * kapağı galeriye almak / galeriden kapak yapmak iki tabloya birden dokunduğu için orkestrasyon
 * `ProductService.makeCover`'da (tek yerde, iki servis birlikte).
 *
 * Listeleme/ekleme/kırpma/sıralama ortak tabandan gelir (`GalleryDbService`) — kardeşi
 * `CategoryImageService` ile aynı davranış, tek fark sahibi gösteren alan.
 */
export class ProductImageService extends GalleryDbService<ProductImage, ProductImageInsert, ProductImageUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'product_image', 'productId', ProductImageSchema, ProductImageInsertSchema, ProductImageUpdateSchema);
  }

  /** Bir ürünün galerisi, müşteriye gösterilecek sırada. */
  listByProduct(productId: string): Promise<ProductImage[]> {
    return this.listByParent(productId);
  }

  /** Galerinin sonuna yeni fotoğraf. */
  add(productId: string, imageKey: string): Promise<ProductImage> {
    return this.addPhoto(productId, imageKey);
  }
}
