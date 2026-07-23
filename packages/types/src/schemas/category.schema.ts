import { z } from 'zod';
import { LocalizedTextSchema } from './localized-text.schema';

// Category — düz (tek seviye), her ürün tek kategoride (DATA_MODEL, DOMAIN §13). 0004 migration.
// Konvansiyon: app modeli camelCase; Schema / InsertSchema / UpdateSchema türetilir.
export const CategorySchema = z.object({
  id: z.string().uuid(),
  name: LocalizedTextSchema,
  slug: z.string(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type Category = z.infer<typeof CategorySchema>;

// id/createdAt DB üretir; sort_order/is_active DB default'lu → opsiyonel. slug servis türetir.
export const CategoryInsertSchema = z.object({
  name: LocalizedTextSchema,
  slug: z.string(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
export type CategoryInsert = z.infer<typeof CategoryInsertSchema>;

// Update: id zorunlu, kalanı opsiyonel (yalnız verilen alanlar yazılır). slug rename'de sabit kalır.
export const CategoryUpdateSchema = CategorySchema.partial().required({ id: true });
export type CategoryUpdate = z.infer<typeof CategoryUpdateSchema>;
