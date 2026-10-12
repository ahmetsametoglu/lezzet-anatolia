import { applicableVatRate, sellableIn, type ProductVatRates } from '@lezzet/domain-core';
import { toCents } from '@lezzet/helper';
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

/** Bir boyun ülke fiyatları ve ürünün ülke oranları; fiyat penceresi ülke alanlarını bunlardan çizer. */
export interface CountryPricing {
  prices: Partial<Record<Country, CountryPriceCells>>;
  vat: Partial<Record<Country, CountryVat>>;
}

/** Pencerenin ülke alanlarının taslağı, euro; boş alanda genel fiyat geçer. */
export type CountryDrafts = Partial<Record<Country, Record<Channel, number | null>>>;

export type CountryPriceWrite =
  { kind: 'write'; country: Country; channel: Channel; amountCents: number } | { kind: 'remove'; country: Country; channel: Channel };

/** Ülke alanlarından yazımlar: boşaltılan alan ülke fiyatını kaldırır ve o ülkede genel fiyat geçer; değişmeyen alan yazılmaz. */
export function countryPriceWrites(drafts: CountryDrafts, saved: Partial<Record<Country, CountryPriceCells>>): CountryPriceWrite[] {
  return FOREIGN_COUNTRIES.flatMap((country) =>
    PRICE_CHANNELS.flatMap((channel): CountryPriceWrite[] => {
      const draft = drafts[country]?.[channel] ?? null;
      const current = saved[country]?.[channel].amountCents ?? null;
      if (draft === null) return current === null ? [] : [{ kind: 'remove', country, channel }];
      const amountCents = toCents(draft);
      return amountCents === current ? [] : [{ kind: 'write', country, channel, amountCents }];
    }),
  );
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
