import { z } from 'zod';

// Ürün ↔ koleksiyon çoklu bağı (product_collections). Bileşik PK (product_id, collection_id) — id yok;
// base'in getAll/upsert/deleteWhere metodlarını kullanır (StaffRole deseni). 0005 migration.
const productCollectionFields = {
  productId: z.string().uuid(),
  collectionId: z.string().uuid(),
};

export const ProductCollectionRowSchema = z.object(productCollectionFields);
export type ProductCollectionRow = z.infer<typeof ProductCollectionRowSchema>;

// Insert = row (bileşik anahtar; türetilen alan yok) ama ayrı şema örneği (base sözleşmesi + tekil export).
export const ProductCollectionInsertSchema = z.object(productCollectionFields);
export type ProductCollectionInsert = z.infer<typeof ProductCollectionInsertSchema>;

// Bileşik anahtar — anlamlı update yok (base sözleşmesi için placeholder).
export const ProductCollectionUpdateSchema = ProductCollectionRowSchema.partial();
export type ProductCollectionUpdate = z.infer<typeof ProductCollectionUpdateSchema>;
