import { z } from 'zod';
import { GalleryImageSchema } from '../primitives/image.schema';

// CategoryImage — kategorinin fotoğraf HAVUZU (0004 migration, 05.23). Kapak burada TEKRARLANMAZ:
// o `category.image_key`'de durur — kartı çizen okuma kategoriyi zaten satır olarak alıyor.
//
// Gövde ortak `GalleryImageSchema`'dan gelir; kardeşi `ProductImageSchema` ile tek farkı hangi
// varlığa asıldığı. **Kullanımları ise ayrışır:** ürün galerisi müşteriye toplu gösterilir, bu havuz
// gösterilmez — kart tek kare çizer ve kare GÜNE göre seçilir (`@lezzet/application` · rotation).
// Bu yüzden buradaki `sortOrder` bir vitrin sırası değil, rotasyonun DÖNGÜ sırasıdır.
export const CategoryImageSchema = GalleryImageSchema.extend({ categoryId: z.string().uuid() });
export type CategoryImage = z.infer<typeof CategoryImageSchema>;

// id/createdAt DB üretir; sortOrder + kırpma alanları DB default'lu → opsiyonel. imageKey zorunlu.
export const CategoryImageInsertSchema = CategoryImageSchema.omit({ id: true, createdAt: true }).partial().required({
  categoryId: true,
  imageKey: true,
});
export type CategoryImageInsert = z.infer<typeof CategoryImageInsertSchema>;

export const CategoryImageUpdateSchema = CategoryImageSchema.partial().required({ id: true });
export type CategoryImageUpdate = z.infer<typeof CategoryImageUpdateSchema>;
