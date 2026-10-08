import { describe, expect, it } from 'vitest';
import { derivePaymentStatus } from '../payment/payment-status';
import { orderAddedVat, refusedGrossCents } from './line';

/** Kapıda geri verilen malın borçtan düşen tutarı; kurye ekranı bunu teslimden önce gösterir, sunucu teslimde aynı borcu bulmalı. */

const lines = [
  { qty: 2, fulfilledQty: 2, unitPriceCents: 1400, lineDiscountAmountCents: 0, vatRate: 5.5, refusedQty: 1 },
  { qty: 1, fulfilledQty: 1, unitPriceCents: 1400, lineDiscountAmountCents: 0, vatRate: 5.5, refusedQty: 0 },
];

const debt = (pricesIncludeVat: boolean, kept: boolean) =>
  derivePaymentStatus({
    lines: lines.map((line) => ({
      fulfilledQty: kept ? line.qty - line.refusedQty : line.qty,
      orderedQty: line.qty,
      unitPriceCents: line.unitPriceCents,
      vatRate: line.vatRate,
    })),
    pricesIncludeVat,
    collectedCents: 0,
    refundedCents: 0,
  }).fulfilledAmountCents;

describe('kapıda geri verilen malın düşülen tutarı', () => {
  it('KDV dahil fiyatta kalemin kendi tutarıdır', () => {
    expect(refusedGrossCents(lines, true)).toBe(1400);
  });

  it("KDV hariç fiyatta KDV'siyle düşer ve teslimden sonraki borçla kuruşu kuruşuna tutar", () => {
    expect(refusedGrossCents(lines, false)).toBe(debt(false, false) - debt(false, true));
    expect(refusedGrossCents(lines, false)).toBe(4431 - 2954);
  });
});

describe('müşteri özetinin KDV satırları', () => {
  const items = [
    { qty: 2, fulfilledQty: 1, goodwillQty: 0, unitPriceCents: 1000, lineDiscountAmountCents: 0, vatRate: 5.5 },
    { qty: 1, fulfilledQty: 1, goodwillQty: 0, unitPriceCents: 1000, lineDiscountAmountCents: 0, vatRate: 20 },
  ];

  it("KDV hariç siparişte oran başına; hazırlık kesinleşince gitmeyen malın KDV'si sayılmaz", () => {
    const order = { pricesIncludeVat: false, vatTreatment: 'domestic' as const };
    expect(orderAddedVat(order, items, false).map((r) => [r.vatRate, r.vatCents])).toEqual([
      [5.5, 110],
      [20, 200],
    ]);
    expect(orderAddedVat(order, items, true).map((r) => [r.vatRate, r.vatCents])).toEqual([
      [5.5, 55],
      [20, 200],
    ]);
  });

  it('KDV dahil siparişte ve ters yüklemede satır yoktur', () => {
    expect(orderAddedVat({ pricesIncludeVat: true, vatTreatment: 'domestic' }, items, true)).toEqual([]);
    expect(orderAddedVat({ pricesIncludeVat: false, vatTreatment: 'intra_eu_b2b_reverse_charge' }, items, true)).toEqual([]);
  });
});
