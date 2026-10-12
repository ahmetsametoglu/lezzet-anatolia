import 'server-only';
import { readCostBasis } from '@lezzet/application';
import { readDistanceSaleThreshold } from '@lezzet/application/accounting/distance-sale-threshold';
import { PriceService, ProductService, ProductVatRateService, type serviceDb } from '@lezzet/database';
import { DEFAULT_PAGE_SIZE, type KeysetCursor, type ProductVatRate } from '@lezzet/types';
import { countryCellsOf, countryVatOf, generalPricesOf } from '@/components/operation/prices/country-prices';
import { toChannelMaps, toPriceRows } from '@/lib/pricing/price-rows';
import { withCountryPrices } from './channel-rows';
import type { PriceRow } from './prices-types';
import { toPriceFilters, type PricesUrlState } from './prices-url';

interface ChannelPageInput {
  urlState: PricesUrlState;
  cursor?: KeysetCursor;
  categoryNames: Map<string, string>;
}

/**
 * Kanal listesinin bir sayfası; ilk sayfa (RSC) ile sonrakiler (eylem) aynı satırı kursun diye tek yerde. Okumalar sayfadaki boylarla
 * sınırlıdır ve satır sayısıyla artmaz.
 */
export async function readChannelPage(
  db: ReturnType<typeof serviceDb>,
  { urlState, cursor, categoryNames }: ChannelPageInput,
): Promise<{ rows: PriceRow[]; nextCursor: KeysetCursor | null }> {
  const page = await new ProductService(db).listPriceRows({ filters: toPriceFilters(urlState), cursor, limit: DEFAULT_PAGE_SIZE });
  const variantIds = page.rows.flatMap((product) => product.variants.map((variant) => variant.id));

  const priceSvc = new PriceService(db);
  const [b2c, b2b, costs, rates, threshold] = await Promise.all([
    priceSvc.findListPricesMap(variantIds, 'b2c'),
    priceSvc.findListPricesMap(variantIds, 'b2b'),
    readCostBasis(db, variantIds),
    new ProductVatRateService(db).listByProducts(page.rows.map((product) => product.id)),
    readDistanceSaleThreshold(db),
  ]);

  const ratesByProduct = new Map<string, ProductVatRate[]>();
  for (const rate of rates) ratesByProduct.set(rate.productId, [...(ratesByProduct.get(rate.productId) ?? []), rate]);

  const rows = toPriceRows({
    products: page.rows,
    prices: toChannelMaps(generalPricesOf(b2c), generalPricesOf(b2b)),
    costs,
    categoryNames,
  });
  return {
    rows: rows.map((row) =>
      withCountryPrices(
        row,
        countryCellsOf(row.variantId, b2c, b2b),
        countryVatOf({ vatRate: row.vatRate, countryRates: ratesByProduct.get(row.productId) ?? [] }, threshold.destinationTaxation),
      ),
    ),
    nextCursor: page.nextCursor,
  };
}
