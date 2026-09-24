import { describe, expect, it } from 'vitest';
import type { CheckoutSnapshot } from '@lezzet/application';
import type { CheckoutShippingOption } from '@lezzet/types';
import { checkoutBlocker, servicePointMissing, type SelectedServicePoint } from './checkout-types';

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

  // Sabit yedek ücret yok: engel kalkarsa düğme bilinmeyen bir toplamla açık kalır ve ret ancak basınca gelir.
  it('kargo ücreti bilinmiyorsa onay kapalıdır', () => {
    const snapshot = snapshotOf({ payment: { ...payment, shippingFeeCents: null, shippingFreeReason: null, orderTotalCents: null } });
    expect(checkoutBlocker({ ...OK, snapshot })).toBe('shipping_unpriced');
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
  const shipping: CheckoutSnapshot['shipping'] = {
    status: 'ok',
    options: [secenek('eve', false), secenek('nokta', true)],
    parcelCount: 1,
    selectedCode: null,
    mode: 'customer',
    unshippable: [],
  };
  const secilen: SelectedServicePoint = {
    id: 'sp-1',
    carrierCode: 'colissimo',
    name: 'Tabac',
    street: 'Rue Chevreul',
    houseNumber: '61',
    postalCode: '69007',
    city: 'Lyon',
    country: 'FR',
    latitude: null,
    longitude: null,
    distanceM: null,
    active: true,
    kind: 'servicepoint',
    openingTimes: null,
    optionCode: 'nokta',
  };

  // Kural `servicePointRequired`da sınanıyor; burada ekranın seçili noktayı hesaba katması: katmasa nokta seçen müşterinin onayı
  // kapalı kalırdı.
  it('nokta istenirken seçilmemişse onay engellenir, seçilince engel kalkar', () => {
    expect(checkoutBlocker({ ...OK, pointMissing: servicePointMissing({ shippingMode: 'point', servicePoint: null }, shipping) })).toBe(
      'service_point_missing',
    );
    expect(
      checkoutBlocker({ ...OK, pointMissing: servicePointMissing({ shippingMode: 'point', servicePoint: secilen }, shipping) }),
    ).toBeNull();
  });
});
