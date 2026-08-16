import { z } from 'zod';
import { GalleryImageSchema } from '../primitives/image.schema';

// ProductImage — ürün detay galerisindeki EK fotoğraflar (0005 migration). Kapak burada TEKRARLANMAZ:
// o `product.image_key`'de durur, çünkü liste/kart/paylaşım kartı kapağı ürünle aynı satırda okur.
//
// Gövdenin tamamı (kimlik + görsel künyesi + sıra) ortak `GalleryImageSchema`'dan gelir; burada
// eklenen tek şey fotoğrafın HANGİ varlığa asıldığı. Kardeşi `CategoryImageSchema` aynı gövdeden
// türer — iki galeri tablosunun alanları böylece ayrışamaz (05.23).
export const ProductImageSchema = GalleryImageSchema.extend({ productId: z.string().uuid() });
export type ProductImage = z.infer<typeof ProductImageSchema>;

// id/createdAt DB üretir; sort_order + kırpma alanları DB default'lu → opsiyonel. imageKey zorunlu.
export const ProductImageInsertSchema = ProductImageSchema.omit({ id: true, createdAt: true }).partial().required({
  productId: true,
  imageKey: true,
});
export type ProductImageInsert = z.infer<typeof ProductImageInsertSchema>;

export const ProductImageUpdateSchema = ProductImageSchema.partial().required({ id: true });
export type ProductImageUpdate = z.infer<typeof ProductImageUpdateSchema>;
