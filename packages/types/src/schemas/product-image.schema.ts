import { z } from 'zod';
import { ImageMetaSchema } from './image.schema';

// ProductImage — ürün detay galerisindeki EK fotoğraflar (0005 migration). Kapak burada TEKRARLANMAZ:
// o `product.image_key`'de durur, çünkü liste/kart/paylaşım kartı kapağı ürünle aynı satırda okur.
//
// Görsel künyesi (anahtar + odak + zoom + alt + damga) ortak `ImageMetaSchema`'dan gelir — alanlar
// burada yeniden yazılmaz (no-duplication). Tek fark: galeride dosya ZORUNLU (anahtarsız galeri satırı
// diye bir şey yok), oysa ortak şemada `imageKey` nullable — çünkü orada "henüz görseli olmayan ürün"
// meşru bir durum.
export const ProductImageSchema = z
  .object({
    id: z.string().uuid(),
    productId: z.string().uuid(),
    sortOrder: z.number().int(),
    createdAt: z.string(),
  })
  .merge(ImageMetaSchema)
  .extend({ imageKey: z.string() });
export type ProductImage = z.infer<typeof ProductImageSchema>;

// id/createdAt DB üretir; sort_order + kırpma alanları DB default'lu → opsiyonel. imageKey zorunlu.
export const ProductImageInsertSchema = ProductImageSchema.omit({ id: true, createdAt: true }).partial().required({
  productId: true,
  imageKey: true,
});
export type ProductImageInsert = z.infer<typeof ProductImageInsertSchema>;

export const ProductImageUpdateSchema = ProductImageSchema.partial().required({ id: true });
export type ProductImageUpdate = z.infer<typeof ProductImageUpdateSchema>;
