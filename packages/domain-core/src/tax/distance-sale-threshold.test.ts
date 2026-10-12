import { describe, expect, it } from 'vitest';
import { distanceSaleThreshold, type DistanceSaleSettings, type DistanceSaleThresholdInput } from './distance-sale-threshold';

const AYAR: DistanceSaleSettings = {
  thresholdCents: 1_000_000,
  firstWarningPercent: 80,
  secondWarningPercent: 95,
  openingYear: 2026,
  openingCents: 0,
  openingPreviousCents: 0,
};

const karar = (over: Partial<DistanceSaleThresholdInput> = {}, ayar: Partial<DistanceSaleSettings> = {}) =>
  distanceSaleThreshold({
    year: 2026,
    currentYearCents: 0,
    previousYearCents: 0,
    orderNetCents: 0,
    ...over,
    settings: { ...AYAR, ...ayar },
  });

describe('uzaktan satış eşiği — varış ülkesi vergilendirmesi', () => {
  it('eşiği aşan sipariş varış ülkesinin oranını alır — sipariş toplamın içindedir', () => {
    expect(karar({ currentYearCents: 995_000, orderNetCents: 10_000 })).toMatchObject({
      destinationTaxation: true,
      yearTotalCents: 1_005_000,
      warning: 'exceeded',
    });
  });

  it('eşiğe eşit toplam aşmış sayılmaz', () => {
    expect(karar({ currentYearCents: 990_000, orderNetCents: 10_000 }).destinationTaxation).toBe(false);
  });

  it('önceki yıl aşıldıysa bu yılın ilk siparişi de varış ülkesinin oranını alır', () => {
    expect(karar({ previousYearCents: 1_000_001, orderNetCents: 100 })).toMatchObject({ destinationTaxation: true, warning: 'exceeded' });
  });

  it('sistem dışı açılış tutarı bu yılın toplamına girer', () => {
    expect(karar({ orderNetCents: 10_000 }, { openingYear: 2026, openingCents: 995_000 })).toMatchObject({
      destinationTaxation: true,
      yearTotalCents: 1_005_000,
    });
  });

  it('açılış yılından önceki yılın tutarı önceki yıl toplamına girer', () => {
    expect(karar({ orderNetCents: 100 }, { openingYear: 2026, openingPreviousCents: 1_000_001 }).destinationTaxation).toBe(true);
  });

  it('yıl dönünce açılış tutarı önceki yılın toplamı olur, ondan sonraki yıl sayılmaz', () => {
    const acilis = { openingYear: 2026, openingCents: 600_000 };
    expect(karar({ year: 2027, previousYearCents: 500_000, orderNetCents: 100 }, acilis)).toMatchObject({
      destinationTaxation: true,
      yearTotalCents: 100,
    });
    expect(karar({ year: 2028, previousYearCents: 500_000, orderNetCents: 100 }, acilis).destinationTaxation).toBe(false);
  });
});

describe('uzaktan satış eşiği — uyarı seviyesi', () => {
  it('ilk ve ikinci uyarı eşiğin ayardaki yüzdelerinde başlar', () => {
    expect(karar({ currentYearCents: 799_999 }).warning).toBe('none');
    expect(karar({ currentYearCents: 800_000 }).warning).toBe('first');
    expect(karar({ currentYearCents: 949_999 }).warning).toBe('first');
    expect(karar({ currentYearCents: 950_000 }).warning).toBe('second');
    expect(karar({ currentYearCents: 1_000_000 }).warning).toBe('second');
  });

  it('uyarı yüzdeleri ayardan okunur', () => {
    expect(karar({ currentYearCents: 500_000 }, { firstWarningPercent: 50 }).warning).toBe('first');
  });
});
