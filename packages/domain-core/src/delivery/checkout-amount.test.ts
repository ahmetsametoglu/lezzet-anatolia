import { describe, expect, it } from 'vitest';
import { checkoutButtonCents, payableTotalCents, type CartAmountInput } from './checkout-amount';

/* Düğme açtığı siparişin tutarını yazmazsa müşteri sepette bir sayı görür, ödeme sayfasında başka bir sayıyla karşılaşır. */

const shippingOnly: CartAmountInput = {
  totalCents: 5092,
  shippingOnly: true,
  shippingFeeCents: 1190,
  split: false,
  localItemsCents: 0,
  localOrderDiscountCents: 0,
};

const split: CartAmountInput = {
  totalCents: 7298,
  shippingOnly: false,
  shippingFeeCents: 1190,
  split: true,
  localItemsCents: 7708,
  localOrderDiscountCents: 616,
};

describe('payableTotalCents', () => {
  it('sepetin tamamı kargodaysa kargo ücreti toplama girer', () => {
    expect(payableTotalCents(shippingOnly)).toBe(6282);
  });

  it('karışık sepette kargo ücreti toplama girmez', () => {
    expect(payableTotalCents(split)).toBe(7298);
  });
});

describe('checkoutButtonCents', () => {
  it('bölünmüş sepette kapı siparişinin kendi indirimiyle tutarını yazar', () => {
    expect(checkoutButtonCents(split)).toBe(7092);
  });

  it('tek sipariş doğuyorsa ödenecek tutarı yazar', () => {
    expect(checkoutButtonCents(shippingOnly)).toBe(6282);
  });
});
