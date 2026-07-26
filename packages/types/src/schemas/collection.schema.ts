import { z } from 'zod';
import { LocalizedTextSchema } from './localized-text.schema';

// Collection — esnek pazarlama grubu (Bayram/Yeni/İndirimde). Bir ürün birden çok koleksiyona
// girer; product_collections çoklu bağı Product ile birlikte (task 3). DATA_MODEL, DOMAIN §13.
// Koleksiyon aynı zamanda KENDİ bağlantısıyla paylaşılan bir vitrin sayfasıdır → description +
// imageKey OG kartını (başlık/açıklama/görsel) besler.
export const CollectionSchema = z.object({
  id: z.string().uuid(),
  name: LocalizedTextSchema,
  description: LocalizedTextSchema.nullable(),
  slug: z.string(),
  imageKey: z.string().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type Collection = z.infer<typeof CollectionSchema>;

export const CollectionInsertSchema = z.object({
  name: LocalizedTextSchema,
  description: LocalizedTextSchema.nullish(),
  slug: z.string(),
  imageKey: z.string().nullish(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
export type CollectionInsert = z.infer<typeof CollectionInsertSchema>;

export const CollectionUpdateSchema = CollectionSchema.partial().required({ id: true });
export type CollectionUpdate = z.infer<typeof CollectionUpdateSchema>;
