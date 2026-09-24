import { describe, expect, it } from 'vitest';
import { shippingChoiceView } from './shipping-view';

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
