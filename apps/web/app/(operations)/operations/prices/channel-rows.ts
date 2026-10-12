import { isBelowTargetMargin, revenueHtOf, targetMarginFor, tightestMargin } from '@lezzet/domain-core';
import type { Channel, Country } from '@lezzet/types';
import { FOREIGN_COUNTRIES, PRICE_CHANNELS, type CountryPriceCells, type CountryVat } from '@/components/operation/prices/country-prices';
import type { PriceRow as ListPriceRow } from '@/lib/pricing/price-rows';
import type { PriceRow } from './prices-types';

/** Boyun bir satış hâli: kanal, ülke (`null` = genel fiyat) ve o hâlin KDV hariç geliri. */
interface Sale {
  channel: Channel;
  country: Country | null;
  revenueHtCents: number;
}

/**
 * Genel fiyat satıcının oranıyla, her ülkede geçen fiyat (ülke fiyatı yoksa genel) orada uygulanan oranla sayılır. Tüketiciye satılmayan
 * ülkenin B2C'si sayılmaz, çünkü o fiyattan satış olmaz.
 */
function salesOf(
  row: ListPriceRow,
  prices: Partial<Record<Country, CountryPriceCells>>,
  vat: Partial<Record<Country, CountryVat>>,
): Sale[] {
  const sales: Sale[] = [];
  for (const channel of PRICE_CHANNELS) {
    const amount = row[channel].amountCents;
    if (amount !== null) sales.push({ channel, country: null, revenueHtCents: revenueHtOf(channel, amount, row.vatRate) });
  }
  for (const country of FOREIGN_COUNTRIES) {
    for (const channel of PRICE_CHANNELS) {
      const amount = prices[country]?.[channel].amountCents ?? row[channel].amountCents;
      const countryVat = vat[country];
      const rate = channel === 'b2b' ? row.vatRate : countryVat?.sellableToConsumer ? countryVat.consumerRate : null;
      if (amount !== null && rate !== null) sales.push({ channel, country, revenueHtCents: revenueHtOf(channel, amount, rate) });
    }
  }
  return sales;
}

/** Genel satıra ülke fiyatlarını ekler; marj ve marj-altı kararı bütün satış hâllerinden yeniden verilir, çünkü en dar marj ülke fiyatında olabilir. */
export function withCountryPrices(
  row: ListPriceRow,
  countryPrices: Partial<Record<Country, CountryPriceCells>>,
  countryVat: Partial<Record<Country, CountryVat>>,
): PriceRow {
  const sales = salesOf(row, countryPrices, countryVat);
  // Motorun anahtarı serbest metindir; sıra numarası en dar hâlin kanalını ve ülkesini geri bulmaya yeter.
  const tightest = tightestMargin(
    sales.map((sale, index) => ({ channel: String(index), revenueHtCents: sale.revenueHtCents })),
    row.costCents,
  );
  const tightestSale = tightest === null ? null : sales[Number(tightest.channel)];
  const verdicts = sales
    .map((sale) =>
      isBelowTargetMargin(
        sale.revenueHtCents,
        row.costCents,
        targetMarginFor(sale.channel, row.targetMarginPercent, row.targetMarginB2bPercent),
      ),
    )
    .filter((verdict): verdict is boolean => verdict !== null);

  return {
    ...row,
    countryPrices,
    countryVat,
    marginPercent: tightest?.percent ?? null,
    marginChannel: tightestSale?.channel ?? null,
    marginCountry: tightestSale?.country ?? null,
    belowTarget: verdicts.length === 0 ? null : verdicts.some(Boolean),
  };
}

/** Satırlardaki ülke fiyatı sayısı, ülke başına; boş hücrede genel fiyat geçer ve sayılmaz. */
export function countCountryPrices(rows: readonly PriceRow[]): Partial<Record<Country, number>> {
  return Object.fromEntries(
    FOREIGN_COUNTRIES.map((country) => [
      country,
      rows.reduce(
        (sum, row) => sum + PRICE_CHANNELS.filter((channel) => (row.countryPrices[country]?.[channel].amountCents ?? null) !== null).length,
        0,
      ),
    ]),
  );
}
