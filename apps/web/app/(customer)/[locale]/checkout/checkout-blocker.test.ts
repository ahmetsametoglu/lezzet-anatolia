import { describe, expect, it } from 'vitest';
import type { CheckoutSnapshot } from '@lezzet/application';
import type { CheckoutShippingOption } from '@lezzet/types';
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

const OK = { cartFailed: false, cartHasBlocked: false, snapshot: snapshotOf(), addressId: 'adr-1', pointMissing: false };

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

describe('servicePointMissing', () => {
  const secenek = (code: string, needsServicePoint: boolean): CheckoutShippingOption => ({
    code,
    carrierCode: 'colissimo',
    carrierName: 'Colissimo',
    name: code,
    priceCents: 500,
    leadTimeHours: null,
    lastMile: needsServicePoint ? 'service_point' : 'home_delivery',
    needsServicePoint,
    tracked: true,
  });
  const kargo = (options: CheckoutShippingOption[], mode: 'customer' | 'auto' = 'customer'): CheckoutSnapshot['shipping'] => ({
    status: 'ok',
    options,
    parcelCount: 1,
    selectedCode: null,
    mode,
  });
  const ikiTur = kargo([secenek('eve', false), secenek('nokta', true)]);
  const engel = (shippingMode: 'home' | 'point', shipping: CheckoutSnapshot['shipping']) =>
    checkoutBlocker({ ...OK, pointMissing: servicePointMissing({ shippingMode, servicePoint: null }, shipping) });

  it('teslim noktası seçilip nokta seçilmediyse onaylanamaz — sipariş sessizce eve gitmez', () => {
    expect(engel('point', ikiTur)).toBe('service_point_missing');
    expect(engel('home', ikiTur)).toBeNull();
  });

  // Ekran bu adreste nokta türünü çizer; engel kayıtlı seçime bakarsa düğme açık kalır ve sipariş sunucuda düşer.
  it('yalnız nokta servisi varsa kayıtlı seçim "home" olsa da nokta istenir', () => {
    expect(engel('home', kargo([secenek('nokta', true)]))).toBe('service_point_missing');
  });

  // Eşik aşılınca sunucu eve giden servisi seçer ve nokta düşer; engel sürerse seçicisi olmayan ekranda onay kilitlenir.
  it('eşik üstünde nokta istenmez, tür "point" kalmış olsa da', () => {
    expect(engel('point', kargo([secenek('eve', false), secenek('nokta', true)], 'auto'))).toBeNull();
  });
});
