import { z } from 'zod';
import { dbNumeric } from '../primitives/db-numeric';

// PriceGroup — B2B'nin alt kademeleri (kullanıcı kararı 20.08): market aylık yüksek hacim alır,
// restoran/pastane düşük; fark bir İNDİRİM değil FİYATTIR. Grup B2B liste üstünden yüzde taşır;
// çözüm sırası motorda: müşteriye özel → grup → liste (`domain-core/resolve-price`). Üyelik
// `user_profile.price_group_id`te durur. DATA_MODEL: data-model/katalog.md.

export const PriceGroupSchema = z.object({
  id: z.string().uuid(),
  /** Operatörün tanıyacağı ad ("Market") — iç etiket, müşteriye görünmez. */
  name: z.string(),
  /** B2B listeden düşülen YÜZDE (para değil — `dbNumeric` oran taşır). DB kısıtı: 0 < x < 100. */
  percentOff: dbNumeric,
  createdAt: z.string(),
});
export type PriceGroup = z.infer<typeof PriceGroupSchema>;

export const PriceGroupInsertSchema = z.object({
  name: z.string().min(1),
  percentOff: z.number().positive().lt(100),
});
export type PriceGroupInsert = z.infer<typeof PriceGroupInsertSchema>;

export const PriceGroupUpdateSchema = PriceGroupSchema.partial().required({ id: true });
export type PriceGroupUpdate = z.infer<typeof PriceGroupUpdateSchema>;
