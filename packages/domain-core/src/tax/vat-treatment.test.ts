import { describe, expect, it } from 'vitest';
import { isZeroRated, resolveVatTreatment } from './vat-treatment';

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

describe('isZeroRated — siparişe YAZILMIŞ işlemeden okunur (denetim 26.08)', () => {
  /*
    Karar sipariş açılırken verilip kolona yazılıyor; sonradan okuyan yüzeyler (muhasebe dışa
    aktarımı, kârlılık, sipariş detayı) aynı soruyu KOLONDAN soruyor — girdiler (ülke, kanal, vergi
    no doğrulaması) o gün değişmiş olabilir, sipariş anındaki karar değişmez.

    Bu karşılaştırma üç yerde elle yazılıydı ve dördüncü okuyan onu sormayı unutmuştu: sipariş
    detayı "İçindeki KDV" satırında olmayan bir vergiyi gösteriyordu. İddia buradan kuruluyor ki
    beşinci okuyan aramak zorunda kalsın, hatırlamak değil.
  */
  it('yalnız AB içi B2B reverse charge KDV\'siz sayılır', () => {
    expect(isZeroRated('intra_eu_b2b_reverse_charge')).toBe(true);
  });

  it('yurt içi işleme KDV\'lidir — DE B2C dahil (OSS eşiği aşılana kadar Fransız KDV\'si)', () => {
    expect(isZeroRated('domestic')).toBe(false);
  });

  it('motorun ANLIK kararıyla aynı cevabı verir — iki kaynak ayrışamaz', () => {
    // Aynı gerçeğin iki okunuşu: karar anında `zeroRated`, sonradan kolondan `isZeroRated`.
    for (const input of [
      { channel: 'b2b', deliveryCountry: 'DE', vatNumberValid: true },
      { channel: 'b2b', deliveryCountry: 'DE', vatNumberValid: false },
      { channel: 'b2c', deliveryCountry: 'DE' },
      { channel: 'b2c', deliveryCountry: 'FR' },
      { channel: 'b2b', deliveryCountry: 'FR', vatNumberValid: true },
    ] as const) {
      const karar = resolveVatTreatment(input);
      expect(isZeroRated(karar.treatment)).toBe(karar.zeroRated);
    }
  });
});
