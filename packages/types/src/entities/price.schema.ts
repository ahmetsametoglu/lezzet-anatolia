import { z } from 'zod';
import { ChannelEnum, CountryEnum, CurrencyEnum } from '../primitives/enums.schema';

// Price — fiyat VARYANT seviyesindedir (satılabilir birim varyanttır). Aynı tablo dört işi görür: kanal listesi (customerId boş),
// ülkenin liste fiyatı (country dolu), müşteriye özel fiyat (customerId dolu) ve tarihli geçerlilik (validFrom). DATA_MODEL:
// data-model/katalog.md.
//
// TABAN (DOMAIN §5): `amountCents` KANALIN tabanındadır — b2c satırları KDV **dahil** (TTC), b2b satırları KDV **hariç** (HT). Motor
// iki yöne çevirir ama saklanan değer budur. Alan cent'tir, DB kolonu euro `numeric`; dönüşüm `PriceService.moneyFields`te.

export const PriceSchema = z.object({
  id: z.string().uuid(),
  variantId: z.string().uuid(),
  channel: ChannelEnum,
  /** `null` = her ülkede geçer; dolu = o ülkenin geçersiz kılması. Müşteriye özel satırda daima `null` (kısıt veride). */
  country: CountryEnum.nullable(),
  customerId: z.string().uuid().nullable(), // dolu → o müşteriye özel fiyat
  amountCents: z.number().int(), // kanal tabanında (b2c TTC · b2b HT)
  currency: CurrencyEnum,
  validFrom: z.string(),
  createdAt: z.string(),
});
export type Price = z.infer<typeof PriceSchema>;

// variantId/channel/amountCents zorunlu; kalanı DB default'lu/nullable → opsiyonel.
export const PriceInsertSchema = z.object({
  variantId: z.string().uuid(),
  channel: ChannelEnum,
  country: CountryEnum.nullish(),
  customerId: z.string().uuid().nullish(),
  amountCents: z.number().int(),
  currency: CurrencyEnum.optional(),
  validFrom: z.string().optional(),
});
export type PriceInsert = z.infer<typeof PriceInsertSchema>;

export const PriceUpdateSchema = PriceSchema.partial().required({ id: true });
export type PriceUpdate = z.infer<typeof PriceUpdateSchema>;
