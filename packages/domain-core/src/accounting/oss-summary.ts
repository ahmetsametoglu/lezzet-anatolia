import { toCents } from '@lezzet/helper';
import type { Country, OrderSale } from '@lezzet/types';
import { exportEligibility, vatLinesOf, type SaleVatBasis } from './export';
import type { AccountingLine } from './line';

/** OSS beyanının satırı: çeyrek × varış ülkesi × oran, KDV hariç tutar ve KDV (cent). */
export interface OssSummaryLine {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  country: Country;
  vatRate: number;
  netCents: number;
  vatCents: number;
}

export interface OssSummary {
  /**
   * Varış ülkesinin KDV'siyle yazılan satışlar (`intra_eu_distance_oss`), yıl, çeyrek, ülke ve oran sırasıyla; `orderCount` satıra katkısı
   * olan sipariş sayısıdır, iki oranlı sipariş iki satıra da sayılır.
   */
  lines: Array<OssSummaryLine & { orderCount: number }>;
  /** Eşikten önce satıcının KDV'siyle yazılan uzaktan satışlar (`intra_eu_distance_origin`); Fransa'nın beyanına girer, OSS'ye girmez. */
  originTotal: { netCents: number; vatCents: number };
}

/** Özetin okuduğu satış alanları. */
export type OssSale = SaleVatBasis & Pick<OrderSale, 'saleDate' | 'deliveryCountry' | 'isGiftOrder'>;

/**
 * Dönemin OSS özeti, aktarım satırıyla aynı türetimden (`vatLinesOf`); hediye sipariş aktarıma girmediği için buraya da girmez. Çeyrek
 * satışın gerçekleştiği gündür (`saleDate`), çünkü KDV teslimle doğar.
 */
export function ossSummary(sales: ReadonlyArray<{ sale: OssSale; items: readonly AccountingLine[] }>): OssSummary {
  const lines = new Map<string, OssSummary['lines'][number]>();
  const originTotal = { netCents: 0, vatCents: 0 };

  for (const { sale, items } of sales) {
    if (!exportEligibility(sale).included) continue;
    if (sale.vatTreatment !== 'intra_eu_distance_oss' && sale.vatTreatment !== 'intra_eu_distance_origin') continue;
    const { year, quarter } = quarterOf(sale.saleDate);

    for (const vatLine of vatLinesOf(sale, items)) {
      const netCents = toCents(vatLine.net);
      const vatCents = toCents(vatLine.vat);
      if (sale.vatTreatment === 'intra_eu_distance_origin') {
        originTotal.netCents += netCents;
        originTotal.vatCents += vatCents;
        continue;
      }
      const key = `${year}-${quarter}-${sale.deliveryCountry}-${vatLine.vatRate}`;
      const line = lines.get(key) ?? {
        year,
        quarter,
        country: sale.deliveryCountry,
        vatRate: vatLine.vatRate,
        netCents: 0,
        vatCents: 0,
        orderCount: 0,
      };
      line.netCents += netCents;
      line.vatCents += vatCents;
      line.orderCount += 1;
      lines.set(key, line);
    }
  }

  return {
    lines: [...lines.values()].sort(
      (a, b) => a.year - b.year || a.quarter - b.quarter || a.country.localeCompare(b.country) || a.vatRate - b.vatRate,
    ),
    originTotal,
  };
}

function quarterOf(saleDate: string): { year: number; quarter: OssSummaryLine['quarter'] } {
  const [year, month] = saleDate.split('-').map(Number) as [number, number];
  return { year, quarter: (Math.floor((month - 1) / 3) + 1) as OssSummaryLine['quarter'] };
}
