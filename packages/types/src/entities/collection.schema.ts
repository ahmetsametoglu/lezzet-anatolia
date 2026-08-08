import { z } from 'zod';
import { LocalizedTextSchema } from '../primitives/localized-text.schema';
import { ImageMetaInsertSchema, ImageMetaSchema } from '../primitives/image.schema';

// Collection — esnek pazarlama grubu (Bayram/Yeni/İndirimde). Bir ürün birden çok koleksiyona
// girer; product_collections çoklu bağı Product ile birlikte (task 3). DATA_MODEL, DOMAIN §13.
// Koleksiyon aynı zamanda KENDİ bağlantısıyla paylaşılan bir vitrin sayfasıdır → description +
// imageKey OG kartını (başlık/açıklama/görsel) besler.
export const CollectionSchema = z
  .object({
    id: z.string().uuid(),
    name: LocalizedTextSchema,
    description: LocalizedTextSchema.nullable(),
    slug: z.string(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
    createdAt: z.string(),
  })
  .merge(ImageMetaSchema); // kapak (OG kartı) görsel künyesi ortak şemadan: anahtar + odak + zoom + alt
export type Collection = z.infer<typeof CollectionSchema>;

export const CollectionInsertSchema = z
  .object({
    name: LocalizedTextSchema,
    description: LocalizedTextSchema.nullish(),
    slug: z.string(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
  })
  .merge(ImageMetaInsertSchema);
export type CollectionInsert = z.infer<typeof CollectionInsertSchema>;

/**
 * Koleksiyon + üyelik satırları TEK sorguda (gömülü select). Koleksiyon başına ayrı üyelik sorgusu
 * (N+1) yerine aynı turda gelir. `position` vitrin kürasyon sırasıdır — çağıran ona göre sıralar
 * (gömülü ilişkinin sırası sorguda değil, okuma sonrası verilir; küme koleksiyon başına onlarla sınırlı).
 */
export const CollectionWithProductsSchema = CollectionSchema.extend({
  products: z.array(z.object({ productId: z.string().uuid(), position: z.number().int() })),
});
export type CollectionWithProducts = z.infer<typeof CollectionWithProductsSchema>;

export const CollectionUpdateSchema = CollectionSchema.partial().required({ id: true });
export type CollectionUpdate = z.infer<typeof CollectionUpdateSchema>;
