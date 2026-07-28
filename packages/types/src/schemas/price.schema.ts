import { z } from 'zod';
import { dbNumeric } from './db-numeric';
import { ChannelEnum, CurrencyEnum } from './enums.schema';

// Price — fiyat VARYANT seviyesindedir (satılabilir birim varyanttır). Aynı tablo üç işi görür:
// kanal listesi (customerId boş), müşteriye özel fiyat (customerId dolu) ve tarihli geçerlilik
// (validFrom). DATA_MODEL: data-model/katalog.md.
//
// TABAN (DOMAIN §5): `amount` KANALIN tabanındadır — b2c satırları KDV **dahil** (TTC),
// b2b satırları KDV **hariç** (HT). Motor iki yöne çevirir ama saklanan değer budur.

export const PriceSchema = z.object({
  id: z.string().uuid(),
  variantId: z.string().uuid(),
  channel: ChannelEnum,
  customerId: z.string().uuid().nullable(), // dolu → o müşteriye özel fiyat
  amount: dbNumeric, // kanal tabanında (b2c TTC · b2b HT)
  currency: CurrencyEnum,
  validFrom: z.string(),
  createdAt: z.string(),
});
export type Price = z.infer<typeof PriceSchema>;

// variantId/channel/amount zorunlu; kalanı DB default'lu/nullable → opsiyonel.
export const PriceInsertSchema = z.object({
  variantId: z.string().uuid(),
  channel: ChannelEnum,
  customerId: z.string().uuid().nullish(),
  amount: z.number(),
  currency: CurrencyEnum.optional(),
  validFrom: z.string().optional(),
});
export type PriceInsert = z.infer<typeof PriceInsertSchema>;

export const PriceUpdateSchema = PriceSchema.partial().required({ id: true });
export type PriceUpdate = z.infer<typeof PriceUpdateSchema>;
