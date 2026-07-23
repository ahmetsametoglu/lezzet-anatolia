import { z } from 'zod';

// ProductVariant — satılabilir birim (fiyat/stok varyant seviyesinde). 0005 migration, DATA_MODEL.
// Varyantsız görünen ürün de tek (varsayılan) varyant taşır → fiyat/stok mantığı her yerde aynı.
export const ProductVariantSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  label: z.string(),
  netWeightG: z.number().int().nullable(),
  minStockQty: z.number().int().nullable(),
  sku: z.string().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
});
export type ProductVariant = z.infer<typeof ProductVariantSchema>;

export const ProductVariantInsertSchema = z.object({
  productId: z.string().uuid(),
  label: z.string(),
  netWeightG: z.number().int().nullish(),
  minStockQty: z.number().int().nullish(),
  sku: z.string().nullish(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
export type ProductVariantInsert = z.infer<typeof ProductVariantInsertSchema>;

export const ProductVariantUpdateSchema = ProductVariantSchema.partial().required({ id: true });
export type ProductVariantUpdate = z.infer<typeof ProductVariantUpdateSchema>;
