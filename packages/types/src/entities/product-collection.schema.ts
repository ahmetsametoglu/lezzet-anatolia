import { z } from 'zod';

// Ürün ↔ koleksiyon çoklu bağı (product_collections). Bileşik PK (product_id, collection_id) — id yok;
// base'in getAll/upsert/deleteWhere metodlarını kullanır (StaffRole deseni). 0005 migration.
// `position`: koleksiyon İÇİNDEKİ vitrin sırası — üyeler buna göre sıralı okunur.
const productCollectionFields = {
  productId: z.string().uuid(),
  collectionId: z.string().uuid(),
  position: z.number().int(),
};

export const ProductCollectionRowSchema = z.object(productCollectionFields);
export type ProductCollectionRow = z.infer<typeof ProductCollectionRowSchema>;

// Insert = row; yalnız `position` opsiyonel (DB default 0 — sıra vermeden bağ kurulabilir).
export const ProductCollectionInsertSchema = ProductCollectionRowSchema.partial({ position: true });
export type ProductCollectionInsert = z.infer<typeof ProductCollectionInsertSchema>;

// Bileşik anahtar — anlamlı update yok (base sözleşmesi için placeholder).
export const ProductCollectionUpdateSchema = ProductCollectionRowSchema.partial();
export type ProductCollectionUpdate = z.infer<typeof ProductCollectionUpdateSchema>;
