import { z } from 'zod';
import { CountryEnum } from '../primitives/enums.schema';

// Address — müşteri adresi. `customerId` = "müşteri rolüyle davranan profil" (`user_profiles.id`);
// ayrı bir müşteri tablosu yoktur (bkz. user-profile.schema).
//
// `inRoute` SAKLANMAZ: posta kodunun aktif bir DeliveryZone'a düşmesinden türetilir (modül 07).

export const AddressSchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  /**
   * Müşterinin kendi verdiği ad ("Ev", "İş"). Checkout adres kartının başlığı budur — iki adres
   * arasında seçim yapan müşteri sokak adını okuyarak değil, adıyla ayırt eder. Boşsa ekran şehri
   * başlık yapar; uydurma bir etiket yazılmaz.
   */
  label: z.string().nullable(),
  /**
   * Adrese GİDEN kişi — hesap sahibiyle aynı olmak zorunda değil (hediye, iş adresi, aile büyüğü).
   * Kurye kapıda kimi soracağını buradan bilir.
   */
  recipient: z.string().nullable(),
  line1: z.string(),
  line2: z.string().nullable(),
  postalCode: z.string(),
  city: z.string(),
  /**
   * Teslimat telefonu — ADRESE aittir, hesaba değil (`UserProfile.phone` hesabın numarasıdır).
   * Kapıya teslimde kurye önce arar; hediye adresinde aranacak numara alıcınınkidir.
   */
  phone: z.string().nullable(),
  country: CountryEnum,
  /** Checkout'un önceden seçtiği adres — tekildir (yenisi seçilince eskisi düşer). */
  isDefault: z.boolean(),
  createdAt: z.string(),
});
export type Address = z.infer<typeof AddressSchema>;

export const AddressInsertSchema = z.object({
  customerId: z.string().uuid(),
  label: z.string().nullish(),
  recipient: z.string().nullish(),
  line1: z.string().min(1),
  line2: z.string().nullish(),
  postalCode: z.string().min(1),
  city: z.string().min(1),
  phone: z.string().nullish(),
  country: CountryEnum.optional(),
  isDefault: z.boolean().optional(),
});
export type AddressInsert = z.infer<typeof AddressInsertSchema>;

export const AddressUpdateSchema = AddressSchema.partial().required({ id: true });
export type AddressUpdate = z.infer<typeof AddressUpdateSchema>;
