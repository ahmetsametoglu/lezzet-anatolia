import { describe, expect, it } from 'vitest';
import { derivePaymentStatus } from '../payment/payment-status';
import { refusedGrossCents } from './line';

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
