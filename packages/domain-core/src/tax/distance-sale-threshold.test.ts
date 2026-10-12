import { describe, expect, it } from 'vitest';
import type { AccountingLine } from '../accounting/line';
import {
  distanceSaleLedger,
  distanceSaleThreshold,
  type DistanceSaleOrder,
  type DistanceSaleSettings,
  type DistanceSaleThresholdInput,
} from './distance-sale-threshold';

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
    latched: false,
    ...over,
    settings: { ...AYAR, ...ayar },
  });

describe('uzaktan satış eşiği — varış ülkesi vergilendirmesi', () => {
  it('eşiği aşan sipariş varış ülkesinin oranını alır — sipariş toplamın içindedir', () => {
    expect(karar({ currentYearCents: 995_000, orderNetCents: 10_000 })).toMatchObject({
      destinationTaxation: true,
      sincePreviousYear: false,
      yearTotalCents: 1_005_000,
      warning: 'exceeded',
    });
  });

  it('eşiğe eşit toplam aşmış sayılmaz', () => {
    expect(karar({ currentYearCents: 990_000, orderNetCents: 10_000 }).destinationTaxation).toBe(false);
  });

  it('önceki yıl aşıldıysa bu yılın ilk siparişi de varış ülkesinin oranını alır', () => {
    expect(karar({ previousYearCents: 1_000_001, orderNetCents: 100 })).toMatchObject({
      destinationTaxation: true,
      sincePreviousYear: true,
      previousYearTotalCents: 1_000_001,
      warning: 'exceeded',
    });
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

  it("mandal: bu yıl varış ülkesinin KDV'siyle yazılmış sipariş varsa toplam eşiğin altına inse de karar varışta kalır", () => {
    expect(karar({ currentYearCents: 900_000, latched: true })).toMatchObject({
      destinationTaxation: true,
      sincePreviousYear: false,
      warning: 'exceeded',
    });
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

/** 10,55 € TTC, %5,5: KDV hariç tam 10 €; toplamlar böylece adetle okunur. */
const kalem = (over: Partial<AccountingLine> = {}): AccountingLine => ({
  qty: 1,
  fulfilledQty: 1,
  goodwillQty: 0,
  unitPriceCents: 1055,
  lineDiscountAmountCents: 0,
  vatRate: 5.5,
  ...over,
});

let sira = 0;
const siparis = (over: Partial<DistanceSaleOrder> = {}): DistanceSaleOrder => ({
  id: `o${(sira += 1)}`,
  referenceNo: `SIP-${sira}`,
  status: 'delivered',
  vatTreatment: 'intra_eu_distance_origin',
  createdAt: '2026-05-10T10:00:00+00:00',
  pricesIncludeVat: true,
  shippingFeeCents: 0,
  ...over,
});

describe('uzaktan satış eşiği — siparişlerden toplam', () => {
  it('taslak, iptal ve bütünüyle iade edilen sipariş girmez; hazırlanmamış sipariş sipariş edilen adetle girer', () => {
    const defter = distanceSaleLedger(2026, [
      { order: siparis({ status: 'delivered' }), items: [kalem()] },
      { order: siparis({ status: 'confirmed' }), items: [kalem({ fulfilledQty: 0 })] },
      { order: siparis({ status: 'cancelled' }), items: [kalem()] },
      { order: siparis({ status: 'draft' }), items: [kalem()] },
      { order: siparis({ status: 'returned' }), items: [kalem()] },
    ]);
    expect(defter.currentYearCents).toBe(2_000);
  });

  it('iade edilen ve müşteride kalan adet ücretlenen tutardan düşer', () => {
    const defter = distanceSaleLedger(2026, [{ order: siparis(), items: [kalem({ qty: 3, fulfilledQty: 2, goodwillQty: 1 })] }]);
    expect(defter.currentYearCents).toBe(1_000);
  });

  it('yurt içi ve ters yüklemeli satış toplama girmez', () => {
    const defter = distanceSaleLedger(2026, [
      { order: siparis({ vatTreatment: 'domestic' }), items: [kalem()] },
      { order: siparis({ vatTreatment: 'intra_eu_b2b_reverse_charge' }), items: [kalem()] },
    ]);
    expect(defter).toMatchObject({ currentYearCents: 0, previousYearCents: 0 });
  });

  it('yıl Paris takvimiyle okunur: 31 Aralık 23:30 UTC yeni yılın siparişidir', () => {
    const defter = distanceSaleLedger(2027, [
      { order: siparis({ createdAt: '2026-12-31T23:30:00+00:00' }), items: [kalem()] },
      { order: siparis({ createdAt: '2026-12-31T22:30:00+00:00' }), items: [kalem({ qty: 2, fulfilledQty: 2 })] },
      { order: siparis({ createdAt: '2025-06-01T10:00:00+00:00' }), items: [kalem()] },
    ]);
    expect(defter).toMatchObject({ currentYearCents: 1_000, previousYearCents: 2_000 });
  });

  it("eşiği aşan, bu yılın en erken varış KDV'li siparişidir; önceki yılınki ve kaynak KDV'li sipariş sayılmaz", () => {
    const ilk = siparis({ vatTreatment: 'intra_eu_distance_oss', createdAt: '2026-02-10T09:00:00+00:00' });
    const defter = distanceSaleLedger(2026, [
      { order: siparis({ vatTreatment: 'intra_eu_distance_oss', createdAt: '2026-03-02T09:00:00+00:00' }), items: [kalem()] },
      { order: ilk, items: [kalem()] },
      { order: siparis({ vatTreatment: 'intra_eu_distance_oss', createdAt: '2025-12-20T09:00:00+00:00' }), items: [kalem()] },
      { order: siparis({ createdAt: '2026-01-05T09:00:00+00:00' }), items: [kalem()] },
      { order: siparis({ vatTreatment: 'intra_eu_distance_oss', status: 'cancelled', createdAt: '2026-01-02T09:00:00+00:00' }), items: [] },
    ]);
    expect(defter.firstDestinationOrder).toEqual({ id: ilk.id, referenceNo: ilk.referenceNo, createdAt: ilk.createdAt });
  });
});
