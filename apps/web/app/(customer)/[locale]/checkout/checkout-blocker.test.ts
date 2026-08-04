import { describe, expect, it } from 'vitest';
import type { CheckoutSnapshot } from './actions';
import { checkoutBlocker } from './checkout-types';

/**
 * Siparişin verilememe sebebi — iki ekranın (özet kartı + kart ödemesi formu) TEK cevabı.
 *
 * Bu testin varlık sebebi somut: koşul iki yerde ayrı yazılıyken ikisi tutmuyordu ve fark hiçbir
 * hata vermiyordu — sepette gönderilemeyen kalem varken kartsız yolun düğmesi pasif, kart formu
 * açıktı. Aşağıdaki `undeliverable_line` durumları tam olarak o farkı çiviliyor.
 */
const payment: NonNullable<CheckoutSnapshot['payment']> = {
  methods: ['card'],
  creditAvailable: false,
  codBlockedReason: null,
  cashWarning: false,
  shippingFeeCents: 0,
  shippingFreeReason: 'route',
  orderTotalCents: 4000,
  minBasketOk: true,
  missingForMinBasketCents: 0,
};

const delivery: NonNullable<CheckoutSnapshot['delivery']> = {
  deliveryType: 'route',
  availableDates: ['2026-08-06'],
  requiresDateChoice: true,
  blocked: false,
};

function snapshotOf(over: Partial<CheckoutSnapshot> = {}): CheckoutSnapshot {
  return { addresses: [], delivery, payment, ...over };
}

const OK = { cartFailed: false, cartHasBlocked: false, snapshot: snapshotOf(), addressId: 'adr-1' };

describe('checkoutBlocker', () => {
  it('her şey yerindeyse null döner', () => {
    expect(checkoutBlocker(OK)).toBeNull();
  });

  it('okunamayan sepet her şeyin önüne geçer', () => {
    expect(checkoutBlocker({ ...OK, cartFailed: true, cartHasBlocked: true })).toBe('cart_unreachable');
  });

  it('adres seçilmemişse "sorulmamış soru" hâli döner, engel değil', () => {
    expect(checkoutBlocker({ ...OK, addressId: null })).toBe('address_missing');
  });

  it('ödeme bloğu çözülmemişse de adres cevabı beklenir', () => {
    expect(checkoutBlocker({ ...OK, snapshot: snapshotOf({ payment: null }) })).toBe('address_missing');
  });

  it('teslimat çözülemiyorsa engeldir (rota dışı + soğuk zincir)', () => {
    expect(checkoutBlocker({ ...OK, snapshot: snapshotOf({ delivery: { ...delivery, blocked: true } }) })).toBe('undeliverable_line');
  });

  it('SEPETTEKİ gönderilemeyen kalem de engeldir — kart formunun kaçırdığı hâl', () => {
    expect(checkoutBlocker({ ...OK, cartHasBlocked: true })).toBe('undeliverable_line');
  });

  it('asgari sepet en sonda sorulur', () => {
    expect(checkoutBlocker({ ...OK, snapshot: snapshotOf({ payment: { ...payment, minBasketOk: false } }) })).toBe('min_basket');
  });

  it('kalem sorunu asgari sepetten önce gelir', () => {
    const snapshot = snapshotOf({ payment: { ...payment, minBasketOk: false } });
    expect(checkoutBlocker({ ...OK, cartHasBlocked: true, snapshot })).toBe('undeliverable_line');
  });
});
