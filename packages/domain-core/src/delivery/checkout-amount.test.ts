import { describe, expect, it } from 'vitest';
import { checkoutButtonCents } from './checkout-amount';

/* Düğme açtığı siparişin tutarını yazmazsa müşteri sepette bir sayı görür, ödeme sayfasında başka bir sayıyla karşılaşır. */

const TTC = { lines: [], basis: { pricesIncludeVat: true, zeroRated: false } };
const line = (group: 'local' | 'shipping', lineTotalCents: number, vatRate: number) => ({ group, lineTotalCents, vatRate });

describe('checkoutButtonCents', () => {
  it('bölünmüş sepette kapı siparişinin kendi indirimiyle tutarını yazar', () => {
    expect(checkoutButtonCents({ totalCents: 7298, split: true, localItemsCents: 7708, localOrderDiscountCents: 616, ...TTC })).toBe(7092);
  });

  it('tek sipariş doğuyorsa sepetin indirimli toplamını yazar, kargo ücreti katılmaz', () => {
    expect(checkoutButtonCents({ totalCents: 5092, split: false, localItemsCents: 0, localOrderDiscountCents: 0, ...TTC })).toBe(5092);
  });

  it("KDV hariç sepette düğme açtığı siparişin KDV dahil tutarını yazar — bölünmüş sepette yalnız kapı kalemlerinin KDV'si", () => {
    const lines = [line('local', 10_000, 5.5), line('local', 2000, 20), line('shipping', 5000, 5.5)];
    const basis = { pricesIncludeVat: false, zeroRated: false };

    expect(checkoutButtonCents({ totalCents: 17_000, split: false, localItemsCents: 0, localOrderDiscountCents: 0, lines, basis })).toBe(
      17_000 + 550 + 400 + 275,
    );
    expect(
      checkoutButtonCents({ totalCents: 17_000, split: true, localItemsCents: 12_000, localOrderDiscountCents: 0, lines, basis }),
    ).toBe(12_000 + 550 + 400);
  });

  it('ters yüklemede KDV eklenmez', () => {
    const lines = [line('local', 10_000, 5.5)];
    const basis = { pricesIncludeVat: false, zeroRated: true };
    expect(checkoutButtonCents({ totalCents: 10_000, split: false, localItemsCents: 0, localOrderDiscountCents: 0, lines, basis })).toBe(
      10_000,
    );
  });
});
