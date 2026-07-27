import { z } from 'zod';
import { CountryEnum } from './enums.schema';

// Address — müşteri adresi. `customerId` = "müşteri rolüyle davranan profil" (`user_profiles.id`);
// ayrı bir müşteri tablosu yoktur (bkz. user-profile.schema).
//
// `inRoute` SAKLANMAZ: posta kodunun aktif bir DeliveryZone'a düşmesinden türetilir (modül 07).

export const AddressSchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  line1: z.string(),
  line2: z.string().nullable(),
  postalCode: z.string(),
  city: z.string(),
  country: CountryEnum,
  /** Checkout'un önceden seçtiği adres — tekildir (yenisi seçilince eskisi düşer). */
  isDefault: z.boolean(),
  createdAt: z.string(),
});
export type Address = z.infer<typeof AddressSchema>;

export const AddressInsertSchema = z.object({
  customerId: z.string().uuid(),
  line1: z.string().min(1),
  line2: z.string().nullish(),
  postalCode: z.string().min(1),
  city: z.string().min(1),
  country: CountryEnum.optional(),
  isDefault: z.boolean().optional(),
});
export type AddressInsert = z.infer<typeof AddressInsertSchema>;

export const AddressUpdateSchema = AddressSchema.partial().required({ id: true });
export type AddressUpdate = z.infer<typeof AddressUpdateSchema>;
