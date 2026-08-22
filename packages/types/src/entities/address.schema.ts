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
   *
   * ZORUNLU (kullanıcı kararı 22.08, kolon `not null`): adres kaydının kendisi *"burada kim teslim
   * alır"* sorusunun cevabıdır. Nullable kaldığı sürece cevap OKUMA anına erteleniyordu ve okuyan
   * her uç kendi yedeğini uyduruyordu — ölçüldü, iki yüzey aynı veride zıt karar verdi. Kolaylık
   * formda: yeni adres hesabın künyesiyle dolu açılır, müşteri ister değiştirir.
   */
  recipient: z.string(),
  line1: z.string(),
  line2: z.string().nullable(),
  postalCode: z.string(),
  city: z.string(),
  /**
   * Teslimat telefonu — ADRESE aittir, hesaba değil (`UserProfile.phone` hesabın numarasıdır).
   * Kapıya teslimde kurye önce arar; hediye adresinde aranacak numara alıcınınkidir.
   *
   * ZORUNLU (kullanıcı kararı 22.08, kolon `not null`) — gerekçesi `recipient` ile aynı. Biçim
   * E.164 ve istemcide indirgeniyor (`normalizePhone`); şema BİÇİM dayatmaz, varlığını zorlar.
   */
  phone: z.string(),
  country: CountryEnum,
  /** Checkout'un önceden seçtiği adres — tekildir (yenisi seçilince eskisi düşer). */
  isDefault: z.boolean(),
  createdAt: z.string(),
});
export type Address = z.infer<typeof AddressSchema>;

export const AddressInsertSchema = z.object({
  customerId: z.string().uuid(),
  label: z.string().nullish(),
  /** Kolon `not null` — yazan hiçbir yol (form, besleme, içe aktarma) bunu atlayamaz (22.08). */
  recipient: z.string().min(1),
  line1: z.string().min(1),
  line2: z.string().nullish(),
  postalCode: z.string().min(1),
  city: z.string().min(1),
  /** Kolon `not null`; biçim E.164'e istemcide indirgenir (`normalizePhone`). */
  phone: z.string().min(1),
  country: CountryEnum.optional(),
  isDefault: z.boolean().optional(),
});
export type AddressInsert = z.infer<typeof AddressInsertSchema>;

export const AddressUpdateSchema = AddressSchema.partial().required({ id: true });
export type AddressUpdate = z.infer<typeof AddressUpdateSchema>;
