import type { Country } from '@lezzet/types';
import type { CountryPriceCells, CountryVat } from '@/components/operation/prices/country-prices';
import type { VariantRowDetail } from '../../products-types';

export type VariantDetail = VariantRowDetail & { countryPrices: Partial<Record<Country, CountryPriceCells>> };

/** Açılan satırın tek okuması: boylar ve ürünün ülke oranları birlikte gelir, çünkü ülke hücresinin marjı orana bağlıdır. */
export interface ProductRowDetail {
  variants: VariantDetail[];
  sellerRate: number;
  countryVat: Partial<Record<Country, CountryVat>>;
  /** Otomatik fiyatın yuvarlama adımı (cent); kırılımdan açılan fiyat penceresinin önizlemesi yazımla aynı adımı kullansın. */
  autoPriceStepCents: number;
}
