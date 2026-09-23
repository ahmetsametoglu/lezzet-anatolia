import { describe, expect, it } from 'vitest';
import { paymentKeyOf } from './detail-types';

/* Ödeme hapı: gel-al'da borç depoda ödenir; kapıda/depoda tahsil edilmiş sipariş "ödenecek" demez. */
describe('paymentKeyOf', () => {
  const base = { onAccount: false, paymentMethod: 'cash' as const };

  it("bekleyen gel-al siparişi 'depoda ödenecek', rota siparişi 'kapıda ödenecek'", () => {
    expect(paymentKeyOf({ ...base, paymentStatus: 'pending', deliveryType: 'pickup' })).toBe('pickup');
    expect(paymentKeyOf({ ...base, paymentStatus: 'pending', deliveryType: 'route' })).toBe('door');
  });

  it("teslimde tahsil edilmiş sipariş 'teslimde ödendi' — iade ve vade önce gelir", () => {
    expect(paymentKeyOf({ ...base, paymentStatus: 'paid', deliveryType: 'pickup' })).toBe('paidOnHandover');
    expect(paymentKeyOf({ ...base, paymentStatus: 'refunded', deliveryType: 'pickup' })).toBe('refunded');
    expect(paymentKeyOf({ ...base, onAccount: true, paymentStatus: 'paid', deliveryType: 'route' })).toBe('credit');
  });
});
