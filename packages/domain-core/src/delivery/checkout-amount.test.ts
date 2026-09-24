import { describe, expect, it } from 'vitest';
import { checkoutButtonCents } from './checkout-amount';

/* Düğme açtığı siparişin tutarını yazmazsa müşteri sepette bir sayı görür, ödeme sayfasında başka bir sayıyla karşılaşır. */

describe('checkoutButtonCents', () => {
  it('bölünmüş sepette kapı siparişinin kendi indirimiyle tutarını yazar', () => {
    expect(checkoutButtonCents({ totalCents: 7298, split: true, localItemsCents: 7708, localOrderDiscountCents: 616 })).toBe(7092);
  });

  it('tek sipariş doğuyorsa sepetin indirimli toplamını yazar, kargo ücreti katılmaz', () => {
    expect(checkoutButtonCents({ totalCents: 5092, split: false, localItemsCents: 0, localOrderDiscountCents: 0 })).toBe(5092);
  });
});
