import { z } from 'zod';

// Ürün ↔ koleksiyon çoklu bağı (product_collections). Bileşik PK (product_id, collection_id) — id yok;
// base'in getAll/upsert/deleteWhere metodlarını kullanır (StaffRole deseni). 0005 migration.
export const ProductCollectionRowSchema = z.object({
  productId: z.string().uuid(),
  collectionId: z.string().uuid(),
});
export type ProductCollectionRow = z.infer<typeof ProductCollectionRowSchema>;

export const ProductCollectionInsertSchema = ProductCollectionRowSchema;
export type ProductCollectionInsert = z.infer<typeof ProductCollectionInsertSchema>;

// Bileşik anahtar — anlamlı update yok (base sözleşmesi için placeholder).
export const ProductCollectionUpdateSchema = ProductCollectionRowSchema.partial();
export type ProductCollectionUpdate = z.infer<typeof ProductCollectionUpdateSchema>;
