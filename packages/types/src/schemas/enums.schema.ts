import { z } from 'zod';

// Proje-geneli enum'lar — DATA_MODEL "Enum'lar (özet)" listesinin karşılığı (01-types görevi 01.2).
// Ölçüt: birden çok varlık kullanıyorsa BURAYA; tek varlığa özgüyse o varlığın şemasında kalır
// (ör. ProductAllergen yalnız üründe → product.schema.ts).
//
// Liste artımlı büyür: bir enum, onu kullanan ilk varlık yazılırken eklenir.

/** Kanal — *kim* alıyor. `Price`, `Order`, `Customer` türetimi ve `Discount` kapsamı kullanır. */
export const ChannelEnum = z.enum(['b2b', 'b2c']);
export type Channel = z.infer<typeof ChannelEnum>;

/** Para birimi. Tek pazar (FR/DE) → tek değer; çoklu döviz Faz 1'de yok. */
export const CurrencyEnum = z.enum(['EUR']);
export type Currency = z.infer<typeof CurrencyEnum>;
