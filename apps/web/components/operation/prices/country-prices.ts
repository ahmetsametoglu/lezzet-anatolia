import { applicableVatRate, sellableIn, type ProductVatRates } from '@lezzet/domain-core';
import { CountryEnum, SELLER_COUNTRY, type Channel, type Country, type Price } from '@lezzet/types';
import type { ChannelPriceCell } from '@/lib/pricing/price-rows';

/** Fiyat kolonlarının kanal sırası; B2C önce gelir, çünkü ana kanal odur. */
export const PRICE_CHANNELS: readonly Channel[] = ['b2c', 'b2b'];

/** Ülke fiyatı yazılabilen ülkeler; satıcının ülkesinde genel fiyat geçtiği için onun kolonu yoktur. */
export const FOREIGN_COUNTRIES: readonly Country[] = CountryEnum.options.filter((country) => country !== SELLER_COUNTRY);

/** Ülke kolonunun başlığı Fiyatlar ile Ürünler kırılımında aynı kalsın diye tek yerde: "B2C (DE)". */
export function countryColumnLabel(channel: Channel, country: Country): string {
  return `${channel.toUpperCase()} (${country})`;
}

/** Bir ülkenin iki kanal hücresi; tutarı `null` olan hücrede o ülkede genel fiyat geçer. */
export interface CountryPriceCells {
  b2c: ChannelPriceCell;
  b2b: ChannelPriceCell;
}

/** Ürünün o ülkedeki oranı, oradaki tüketiciye bugün uygulanan oran ve ürünün oradaki tüketiciye satılıp satılmadığı. */
export interface CountryVat {
  rate: number | null;
  consumerRate: number | null;
  sellableToConsumer: boolean;
}

/** Bir kanalın liste fiyatları, `PriceService.findListPricesMap` biçiminde. */
type ListPrices = ReadonlyMap<string, { general: Price | null; byCountry: Partial<Record<Country, Price>> }>;

const cellOf = (price: Price | null | undefined): ChannelPriceCell =>
  price ? { amountCents: price.amountCents, validFrom: price.validFrom } : { amountCents: null, validFrom: null };

/** Genel fiyatlar `toChannelMaps` biçiminde; ülke fiyatı genel satırın marjına karışmasın diye ayrılır. */
export function generalPricesOf(lists: ListPrices): Map<string, { channelPrice: Price | null }> {
  return new Map([...lists].map(([variantId, list]) => [variantId, { channelPrice: list.general }]));
}

/** Boyun ülke hücreleri; genel fiyat buraya yazılmaz, yoksa hücre "genel" yerine kendi fiyatı varmış gibi görünürdü. */
export function countryCellsOf(variantId: string, b2c: ListPrices, b2b: ListPrices): Partial<Record<Country, CountryPriceCells>> {
  return Object.fromEntries(
    FOREIGN_COUNTRIES.map((country) => [
      country,
      { b2c: cellOf(b2c.get(variantId)?.byCountry[country]), b2b: cellOf(b2b.get(variantId)?.byCountry[country]) },
    ]),
  );
}

/**
 * Tüketiciye eşik aşılmadıkça satıcının oranı, aşılınca ülkenin oranı uygulanır. Ülkenin oranı girilmemişse eşikten sonra oran
 * `null` kalır, çünkü Fransız oranı onun yerine geçemez.
 */
export function countryVatOf(rates: ProductVatRates, destinationTaxation: boolean): Partial<Record<Country, CountryVat>> {
  return Object.fromEntries(
    FOREIGN_COUNTRIES.map((country) => [
      country,
      {
        rate: applicableVatRate(country, rates),
        consumerRate: applicableVatRate(destinationTaxation ? country : SELLER_COUNTRY, rates),
        sellableToConsumer: sellableIn({ country, channel: 'b2c', countryRates: rates.countryRates }),
      },
    ]),
  );
}
