import { z } from 'zod';
import { LocalizedTextSchema } from './localized-text.schema';
import { ImageMetaInsertSchema, ImageMetaSchema } from './image.schema';

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

export const CollectionUpdateSchema = CollectionSchema.partial().required({ id: true });
export type CollectionUpdate = z.infer<typeof CollectionUpdateSchema>;
