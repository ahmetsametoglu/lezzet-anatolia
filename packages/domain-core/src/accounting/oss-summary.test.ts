import { describe, expect, it } from 'vitest';
import type { AccountingLine } from './line';
import { ossSummary, type OssSale } from './oss-summary';

/** OSS beyanının girdisi: çeyrek, ülke ve oran ayrımı aktarımın KDV kırılımından türer; yanlış kova beyanı yanlış ülkeye yazar. */

const satis = (over: Partial<OssSale> = {}): OssSale => ({
  saleDate: '2026-02-14',
  deliveryCountry: 'DE',
  vatTreatment: 'intra_eu_distance_oss',
  isGiftOrder: false,
  pricesIncludeVat: true,
  shippingFeeCents: 0,
  ...over,
});

/** KDV dahil fiyat, KDV hariç tam 10 € olacak biçimde: %7'de 10,70 €, %19'da 11,90 €, %5,5'te 10,55 €. */
const kalem = (vatRate: number, unitPriceCents: number): AccountingLine => ({
  qty: 1,
  fulfilledQty: 1,
  goodwillQty: 0,
  unitPriceCents,
  lineDiscountAmountCents: 0,
  vatRate,
});
const yedi = kalem(7, 1070);
const ondokuz = kalem(19, 1190);

describe('OSS özeti', () => {
  it('çeyrek × varış ülkesi × oran; çeyrek sınırı satış gününden', () => {
    const ozet = ossSummary([
      { sale: satis({ saleDate: '2026-01-15' }), items: [yedi] },
      { sale: satis({ saleDate: '2026-03-31' }), items: [yedi] },
      { sale: satis({ saleDate: '2026-04-01' }), items: [yedi, ondokuz] },
    ]);
    expect(ozet.lines).toEqual([
      { year: 2026, quarter: 1, country: 'DE', vatRate: 7, netCents: 2_000, vatCents: 140 },
      { year: 2026, quarter: 2, country: 'DE', vatRate: 7, netCents: 1_000, vatCents: 70 },
      { year: 2026, quarter: 2, country: 'DE', vatRate: 19, netCents: 1_000, vatCents: 190 },
    ]);
  });

  it('kargo payı malın oranıyla satıra girer, aktarım satırıyla aynı türetim', () => {
    // 10,70 € mal + 1,07 € kargo, ikisi de %7: KDV hariç 11,00 €, KDV 0,77 €.
    const ozet = ossSummary([{ sale: satis({ shippingFeeCents: 107 }), items: [yedi] }]);
    expect(ozet.lines).toEqual([{ year: 2026, quarter: 1, country: 'DE', vatRate: 7, netCents: 1_100, vatCents: 77 }]);
  });

  it('eşikten önceki uzaktan satış ayrı toplamdır; hediye, yurt içi ve ters yüklemeli satış özete girmez', () => {
    const ozet = ossSummary([
      { sale: satis({ vatTreatment: 'intra_eu_distance_origin' }), items: [kalem(5.5, 1055)] },
      { sale: satis({ isGiftOrder: true }), items: [yedi] },
      { sale: satis({ vatTreatment: 'domestic', deliveryCountry: 'FR' }), items: [kalem(5.5, 1055)] },
      { sale: satis({ vatTreatment: 'intra_eu_b2b_reverse_charge', pricesIncludeVat: false }), items: [kalem(0, 1000)] },
    ]);
    expect(ozet).toEqual({ lines: [], originTotal: { netCents: 1_000, vatCents: 55 } });
  });
});
