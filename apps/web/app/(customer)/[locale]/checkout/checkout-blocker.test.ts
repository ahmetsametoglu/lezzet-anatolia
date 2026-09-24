import { describe, expect, it } from 'vitest';
import type { CheckoutSnapshot } from '@lezzet/application';
import { checkoutBlocker, servicePointMissing } from './checkout-types';

/**
 * Siparişin verilememe sebebi iki ekranın (özet kartı ve kart ödemesi formu) tek cevabıdır. Koşul iki yerde ayrı yazılırsa
 * gönderilemeyen kalem varken kartsız yolun düğmesi pasif, kart formu açık kalır; `undeliverable_line` durumları bunu yakalar.
 */
const payment: NonNullable<CheckoutSnapshot['payment']> = {
  methods: ['card'],
  creditAvailable: false,
  codBlockedReason: null,
  cashWarning: false,
  shippingFeeCents: 0,
  shippingFreeReason: 'route',
  // Rota kulvarı: ücret alınmıyor, dolayısıyla "nereden geldi" sorusu da doğmuyor.
  shippingFeeSource: null,
  orderTotalCents: 4000,
  minBasketOk: true,
  missingForMinBasketCents: 0,
  // Eşiğin dayandığı yer engel kararına girmez, yalnız cümlede geçer; gerçek değer boş metnin de geçtiği varsayımını önler.
  placeLabel: '67000 Strasbourg',
};

const delivery: NonNullable<CheckoutSnapshot['delivery']> = {
  deliveryType: 'route',
  availableDates: ['2026-08-06'],
  requiresDateChoice: true,
  // Komşu daveti engel kararına girmez: davet bir kolaylıktır, sipariş verilebilirliğin koşulu değil.
  neighborInvites: [],
  blocked: false,
  addressInRoute: true,
};

function snapshotOf(over: Partial<CheckoutSnapshot> = {}): CheckoutSnapshot {
  // Özet ve kargo teklifi engel kararına girmez: `checkoutBlocker` sepetin engelli kalemine, adrese ve ödemeye bakar.
  return { addresses: [], delivery, shipping: null, payment, summary: null, pickup: null, ...over };
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

  it('teslim noktası seçilip nokta seçilmediyse onaylanamaz — sipariş sessizce eve gitmez', () => {
    expect(checkoutBlocker({ ...OK, pointMissing: servicePointMissing({ shippingMode: 'point', servicePoint: null }) })).toBe('service_point_missing');
    expect(checkoutBlocker({ ...OK, pointMissing: servicePointMissing({ shippingMode: 'home', servicePoint: null }) })).toBeNull();
  });
});
