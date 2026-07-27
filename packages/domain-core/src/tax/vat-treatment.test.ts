import { describe, expect, it } from 'vitest';
import { resolveVatTreatment } from './vat-treatment';

describe('KDV işleme (03.10)', () => {
  it('FR: her kanalda yurt içi KDV', () => {
    for (const channel of ['b2c', 'b2b'] as const) {
      expect(resolveVatTreatment({ channel, deliveryCountry: 'FR' })).toMatchObject({
        treatment: 'domestic',
        zeroRated: false,
        invoiceNote: null,
        countsTowardOssThreshold: false,
      });
    }
  });

  it('DE B2B + DOĞRULANMIŞ vergi no → reverse charge (%0 + Autoliquidation)', () => {
    expect(resolveVatTreatment({ channel: 'b2b', deliveryCountry: 'DE', vatNumberValid: true })).toEqual({
      treatment: 'intra_eu_b2b_reverse_charge',
      zeroRated: true,
      invoiceNote: 'Autoliquidation',
      countsTowardOssThreshold: false,
    });
  });

  it('DE B2B ama vergi no doğrulanmamış → yurt içi KDV (yanlış %0 uygulanmaz)', () => {
    expect(resolveVatTreatment({ channel: 'b2b', deliveryCountry: 'DE', vatNumberValid: false })).toMatchObject({
      treatment: 'domestic',
      zeroRated: false,
    });
    expect(resolveVatTreatment({ channel: 'b2b', deliveryCountry: 'DE' })).toMatchObject({ treatment: 'domestic' });
  });

  it('DE B2C → Fransız KDV, ama OSS eşiği izlemine sayılır', () => {
    expect(resolveVatTreatment({ channel: 'b2c', deliveryCountry: 'DE' })).toMatchObject({
      treatment: 'domestic',
      zeroRated: false,
      countsTowardOssThreshold: true,
    });
  });

  it('DE B2B eşiği beslemez — eşik yalnız tüketici satışı içindir', () => {
    expect(resolveVatTreatment({ channel: 'b2b', deliveryCountry: 'DE', vatNumberValid: true }).countsTowardOssThreshold).toBe(false);
    expect(resolveVatTreatment({ channel: 'b2b', deliveryCountry: 'DE', vatNumberValid: false }).countsTowardOssThreshold).toBe(false);
  });
});
