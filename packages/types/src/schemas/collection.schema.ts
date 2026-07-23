import { z } from 'zod';
import { LocalizedTextSchema } from './localized-text.schema';

// Collection — esnek pazarlama grubu (Bayram/Yeni/İndirimde). Bir ürün birden çok koleksiyona
// girer; product_collections çoklu bağı Product ile birlikte (task 3). DATA_MODEL, DOMAIN §13.
export const CollectionSchema = z.object({
  id: z.string().uuid(),
  name: LocalizedTextSchema,
  slug: z.string(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type Collection = z.infer<typeof CollectionSchema>;

export const CollectionInsertSchema = z.object({
  name: LocalizedTextSchema,
  slug: z.string(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
export type CollectionInsert = z.infer<typeof CollectionInsertSchema>;

export const CollectionUpdateSchema = CollectionSchema.partial().required({ id: true });
export type CollectionUpdate = z.infer<typeof CollectionUpdateSchema>;
