import { describe, expect, it } from 'vitest';
import { servicePointRequired, shippingChoiceView, shippingNotice } from './shipping-view';

describe('shippingChoiceView — çizilecek tür', () => {
  const ev = { needsServicePoint: false, priceCents: 613 };
  const nokta = { needsServicePoint: true, priceCents: 320 };

  it('iki tür de varsa müşterinin seçtiği tür çizilir, her tür kendi en düşük fiyatıyla', () => {
    expect(shippingChoiceView([ev, nokta], 'point')).toMatchObject({
      hasModes: true,
      mode: 'point',
      homeFromCents: 613,
      pointFromCents: 320,
    });
    expect(shippingChoiceView([ev, nokta], 'home').mode).toBe('home');
  });

  // Müşteri eve teslimi seçmiş olsa da yalnız nokta servisi kaldıysa eve teslim listesi boş çizilir ve sipariş verilemezdi.
  it('yalnız noktaya teslim varsa tür "point", müşterinin eski seçimi ne olursa olsun', () => {
    expect(shippingChoiceView([nokta], 'home')).toMatchObject({ hasModes: false, mode: 'point', homeFromCents: null });
  });

  it('yalnız eve teslim varsa tür "home"', () => {
    expect(shippingChoiceView([ev], 'point')).toMatchObject({ hasModes: false, mode: 'home', pointFromCents: null });
  });
});

describe('servicePointRequired', () => {
  const ev = { needsServicePoint: false, priceCents: 613 };
  const nokta = { needsServicePoint: true, priceCents: 320 };
  const kargo = (options: (typeof ev)[], mode: 'customer' | 'auto' = 'customer') => ({ mode, options });

  it('iki tür varken müşterinin seçtiği tür karar verir', () => {
    expect(servicePointRequired(kargo([ev, nokta]), 'point')).toBe(true);
    expect(servicePointRequired(kargo([ev, nokta]), 'home')).toBe(false);
  });

  // Ekran bu adreste nokta türünü çizer; kural kayıtlı seçime bakarsa onay açık kalır ve sipariş sunucuda düşer.
  it('yalnız nokta servisi varsa kayıtlı seçim "home" olsa da nokta istenir', () => {
    expect(servicePointRequired(kargo([nokta]), 'home')).toBe(true);
  });

  // Eşik aşılınca sunucu eve giden servisi seçer ve nokta düşer; kural sürerse seçicisi olmayan ekranda onay kilitlenir.
  it('eşik üstünde nokta istenmez, tür "point" kalmış olsa da', () => {
    expect(servicePointRequired(kargo([ev, nokta], 'auto'), 'point')).toBe(false);
  });
});

describe('shippingNotice', () => {
  const copy = {
    unavailable: 'geçici',
    unshippable: 'gönderilemiyor: {products}',
    unshippableOrder: 'sipariş gönderilemiyor',
    none: 'servis yok',
  };

  // Taşıyıcı arızasında müşteri beklemeye, veri eksikliğinde ürünü çıkarmaya yönlenir; cümleler karışırsa beklemek işe yaramaz.
  it('taşıyıcıya ulaşılamadıysa geçici cümle, verimiz eksikse ürün adlarıyla "gönderilemiyor"', () => {
    expect(shippingNotice({ status: 'provider_error', unshippable: [] }, copy)).toBe('geçici');
    expect(shippingNotice({ status: 'off', unshippable: [] }, copy)).toBe('geçici');
    expect(shippingNotice({ status: 'unmeasured', unshippable: ['Ceviz', 'Pestil'] }, copy)).toBe('gönderilemiyor: Ceviz, Pestil');
    expect(shippingNotice({ status: 'no_box', unshippable: [] }, copy)).toBe('sipariş gönderilemiyor');
    expect(shippingNotice({ status: 'ok', unshippable: [] }, copy)).toBe('servis yok');
  });
});
