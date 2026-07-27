import { z } from 'zod';

// DeliveryZone — rota bölgesi (DOMAIN §6, ADR-002). Posta kodu kümesi + haftalık günler;
// ikisi de admin-editable, kod sabiti değil.
//
// **Rota içi/dışı SAKLANMAZ, türetilir:** adresin posta kodu aktif bir bölgeye düşüyorsa rota içi.
// Saklansaydı bölge sınırı değişince ertesi gün yalan olurdu.

export const DeliveryZoneSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  postalCodes: z.array(z.string()),
  /** Haftalık teslimat günleri, ISO: 1=Pazartesi … 7=Pazar. */
  weekdays: z.array(z.number().int().min(1).max(7)),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type DeliveryZone = z.infer<typeof DeliveryZoneSchema>;

export const DeliveryZoneInsertSchema = z.object({
  name: z.string().min(1),
  postalCodes: z.array(z.string()).optional(),
  weekdays: z.array(z.number().int().min(1).max(7)).optional(),
  isActive: z.boolean().optional(),
});
export type DeliveryZoneInsert = z.infer<typeof DeliveryZoneInsertSchema>;

export const DeliveryZoneUpdateSchema = DeliveryZoneSchema.partial().required({ id: true });
export type DeliveryZoneUpdate = z.infer<typeof DeliveryZoneUpdateSchema>;
