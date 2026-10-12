import { describe, expect, it } from 'vitest';
import { countryVatOf } from '@/components/operation/prices/country-prices';
import type { PriceRow as ListPriceRow } from '@/lib/pricing/price-rows';
import { withCountryPrices } from './channel-rows';

// Marj rozeti boyun bütün fiyatlarının en darıdır; Almanya fiyatı sayılmazsa zararına Almanya fiyatı listede "marj iyi" görünür.

const cell = (amountCents: number | null) => ({ amountCents, validFrom: null });

const listRow = (over: Partial<ListPriceRow>): ListPriceRow => ({
  variantId: 'v1',
  productId: 'p1',
  productName: 'Karışık Baklava',
  variantLabel: '225 g',
  title: 'Karışık Baklava · 225 g',
  imageUrl: null,
  categoryName: 'Tatlı',
  status: 'active',
  variantActive: true,
  b2c: cell(457),
  b2b: cell(376),
  costCents: 224,
  marginPercent: null,
  marginChannel: null,
  targetMarginPercent: 40,
  targetMarginB2bPercent: null,
  belowTarget: null,
  autoPrice: false,
  costJump: null,
  vatRate: 5.5,
  missingPrice: false,
  ...over,
});

const withRate = (vatRate: number, deRate: number | null) => ({
  vatRate,
  countryRates: deRate === null ? [] : [{ country: 'DE' as const, vatRate: deRate }],
});

describe('withCountryPrices', () => {
  it('en dar marj Almanya fiyatındaysa rozet ülkeyi taşır ve satır marj-altına girer', () => {
    // Genel B2C ≈%93, B2B ≈%68; Almanya B2B 2,95 € → ≈%32, hedef %40.
    const row = withCountryPrices(listRow({}), { DE: { b2c: cell(null), b2b: cell(295) } }, countryVatOf(withRate(5.5, 7), false));
    expect(row.marginCountry).toBe('DE');
    expect(row.marginChannel).toBe('b2b');
    expect(row.marginPercent).toBeCloseTo(32, 0);
    expect(row.belowTarget).toBe(true);
  });

  it('eşikten sonra boş Almanya B2C hücresinde genel fiyat Alman oranıyla sayılır', () => {
    // Şalgam 2,49 €: Fransa %5,5 ile ≈%115, Almanya %19 ile ≈%90; B2B 2,30 € ≈%109.
    const salgam = listRow({ b2c: cell(249), b2b: cell(230), costCents: 110, targetMarginPercent: null });
    const empty = { DE: { b2c: cell(null), b2b: cell(null) } };

    const after = withCountryPrices(salgam, empty, countryVatOf(withRate(5.5, 19), true));
    expect(after.marginCountry).toBe('DE');
    expect(after.marginChannel).toBe('b2c');
    expect(after.marginPercent).toBeCloseTo(90, 0);

    const before = withCountryPrices(salgam, empty, countryVatOf(withRate(5.5, 19), false));
    expect(before.marginCountry).toBeNull();
    expect(before.marginChannel).toBe('b2b');
  });

  it('Almanya’daki tüketiciye satılmayan üründe Almanya B2C fiyatı marja girmez', () => {
    const row = withCountryPrices(listRow({}), { DE: { b2c: cell(100), b2b: cell(null) } }, countryVatOf(withRate(5.5, null), false));
    expect(row.marginCountry).toBeNull();
    expect(row.marginChannel).toBe('b2b');
    expect(row.belowTarget).toBe(false);
  });
});
