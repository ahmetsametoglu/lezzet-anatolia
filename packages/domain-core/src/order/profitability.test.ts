import { describe, expect, it } from 'vitest';
import { orderProfit } from './profitability';

describe('orderProfit', () => {
  it('b2c satışı KDV hariç tabana indirir', () => {
    const result = orderProfit({
      channel: 'b2c',
      lines: [{ amountCents: 10_000, vatRate: 5.5 }],
      shippingCents: 0,
      shippingVatRate: 0,
      cogsCents: 4_000,
      otherCostCents: 0,
      refundedCents: 0,
    });

    expect(result.revenueHtCents).toBe(9_479); // 100,00 € TTC → 94,79 € HT
    expect(result.profitCents).toBe(5_479);
    expect(result.markupPercent).toBeCloseTo(136.98, 1);
  });

  it('b2b tutarı zaten KDV hariçtir — dokunulmaz', () => {
    const result = orderProfit({
      channel: 'b2b',
      lines: [{ amountCents: 20_000, vatRate: 5.5 }],
      shippingCents: 0,
      shippingVatRate: 0,
      cogsCents: 12_000,
      otherCostCents: 0,
      refundedCents: 0,
    });

    expect(result.revenueHtCents).toBe(20_000);
    expect(result.profitCents).toBe(8_000);
    expect(result.markupPercent).toBeCloseTo(66.67, 1);
  });

  it('kargo bedelini satışa katar', () => {
    const result = orderProfit({
      channel: 'b2b',
      lines: [{ amountCents: 20_000, vatRate: 5.5 }],
      shippingCents: 1_000,
      shippingVatRate: 20,
      cogsCents: 12_000,
      otherCostCents: 0,
      refundedCents: 0,
    });

    expect(result.revenueHtCents).toBe(21_000);
    expect(result.profitCents).toBe(9_000);
  });

  it('kargo oranı verilmezse malın oranını izler', () => {
    const result = orderProfit({
      channel: 'b2c',
      lines: [{ amountCents: 10_000, vatRate: 5.5 }],
      shippingCents: 500,
      shippingVatRate: null,
      cogsCents: null,
      otherCostCents: 0,
      refundedCents: 0,
    });

    expect(result.revenueHtCents).toBe(9_479 + 474); // ikisi de %5,5 ile HT'ye iner
  });

  it('maliyet bilinmiyorsa kâr da bilinmez — sıfır varsayılmaz', () => {
    const result = orderProfit({
      channel: 'b2c',
      lines: [{ amountCents: 10_000, vatRate: 5.5 }],
      shippingCents: 0,
      shippingVatRate: 0,
      cogsCents: null,
      otherCostCents: 0,
      refundedCents: 0,
    });

    expect(result.revenueHtCents).toBe(9_479);
    expect(result.profitCents).toBeNull();
    expect(result.markupPercent).toBeNull();
  });

  it('sıfır maliyette markup yoktur (bölünemez)', () => {
    const result = orderProfit({
      channel: 'b2b',
      lines: [{ amountCents: 5_000, vatRate: 5.5 }],
      shippingCents: 0,
      shippingVatRate: 0,
      cogsCents: 0,
      otherCostCents: 0,
      refundedCents: 0,
    });

    expect(result.profitCents).toBe(5_000);
    expect(result.markupPercent).toBeNull();
  });

  it('iade gelirden düşer ve kârı aşağı çeker', () => {
    const withoutRefund = orderProfit({
      channel: 'b2b',
      lines: [{ amountCents: 20_000, vatRate: 5.5 }],
      shippingCents: 0,
      shippingVatRate: 0,
      cogsCents: 12_000,
      otherCostCents: 0,
      refundedCents: 0,
    });
    const withRefund = orderProfit({
      channel: 'b2b',
      lines: [{ amountCents: 20_000, vatRate: 5.5 }],
      shippingCents: 0,
      shippingVatRate: 0,
      cogsCents: 12_000,
      otherCostCents: 0,
      refundedCents: 5_000,
    });

    expect(withRefund.refundHtCents).toBe(5_000);
    expect(withRefund.profitCents).toBe((withoutRefund.profitCents ?? 0) - 5_000);
  });

  it('b2c iadesini siparişin ağırlıklı KDV oranıyla HT’ye indirir', () => {
    const result = orderProfit({
      channel: 'b2c',
      // Yarı yarıya %5,5 ve %20 — ağırlıklı oran %12,75.
      lines: [
        { amountCents: 10_000, vatRate: 5.5 },
        { amountCents: 10_000, vatRate: 20 },
      ],
      shippingCents: 0,
      shippingVatRate: 0,
      cogsCents: 8_000,
      otherCostCents: 0,
      refundedCents: 2_000,
    });

    expect(result.refundHtCents).toBe(1_774); // 20,00 € / 1,1275
    expect(result.profitCents).toBe(result.revenueHtCents - 1_774 - 8_000);
  });

  it('diğer giderler kârdan düşer ve markup tabanına girer', () => {
    const result = orderProfit({
      channel: 'b2b',
      lines: [{ amountCents: 20_000, vatRate: 5.5 }],
      shippingCents: 0,
      shippingVatRate: 0,
      cogsCents: 12_000,
      otherCostCents: 1_400, // kurye payı
      refundedCents: 0,
    });

    expect(result.profitCents).toBe(6_600);
    expect(result.markupPercent).toBeCloseTo(49.25, 1); // taban 13.400, mal maliyeti değil
  });

  it('mal maliyeti yoksa diğer giderler tek başına kâr üretmez', () => {
    const result = orderProfit({
      channel: 'b2b',
      lines: [{ amountCents: 20_000, vatRate: 5.5 }],
      shippingCents: 0,
      shippingVatRate: 0,
      cogsCents: null,
      otherCostCents: 1_400,
      refundedCents: 0,
    });

    expect(result.profitCents).toBeNull();
  });

  it('kalemsiz siparişte satış sıfır, kâr eksi maliyettir', () => {
    const result = orderProfit({
      channel: 'b2c',
      lines: [],
      shippingCents: 0,
      shippingVatRate: 0,
      cogsCents: 1_000,
      otherCostCents: 0,
      refundedCents: 0,
    });

    expect(result.revenueHtCents).toBe(0);
    expect(result.profitCents).toBe(-1_000);
  });
});
