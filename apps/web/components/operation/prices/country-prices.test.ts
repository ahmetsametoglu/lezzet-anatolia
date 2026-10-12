import { describe, expect, it } from 'vitest';
import { markupPercent, revenueHtOf } from '@lezzet/domain-core';
import type { Price } from '@lezzet/types';
import { countryCellsOf, countryPriceWrites, countryVatOf } from './country-prices';

// Almanya'daki tüketici fiyatı KDV dahildir: marj o gün uygulanan oranla hesaplanmazsa eşikten sonra yanlış çıkar.
describe('countryVatOf', () => {
  const lokum = { vatRate: 20, countryRates: [{ country: 'DE' as const, vatRate: 7 }] };

  it('eşik aşılmadıkça Almanya’daki tüketiciye Fransız oranı, aşılınca ürünün Alman oranı uygulanır', () => {
    expect(countryVatOf(lokum, false).DE).toEqual({ rate: 7, consumerRate: 20, sellableToConsumer: true });
    expect(countryVatOf(lokum, true).DE).toEqual({ rate: 7, consumerRate: 7, sellableToConsumer: true });
  });

  it('Alman oranı girilmemiş ürün Almanya’daki tüketiciye satılmaz; eşikten sonra Fransız oranı yerine geçmez', () => {
    expect(countryVatOf({ vatRate: 20, countryRates: [] }, false).DE?.sellableToConsumer).toBe(false);
    expect(countryVatOf({ vatRate: 20, countryRates: [] }, true).DE?.consumerRate).toBeNull();
  });

  it('aynı 13,90 € eşikten önce ≈%90, sonra ≈%113 marj eder', () => {
    const at = (destinationTaxation: boolean) =>
      markupPercent(revenueHtOf('b2c', 1390, countryVatOf(lokum, destinationTaxation).DE?.consumerRate as number), 610);
    expect(at(false)).toBeCloseTo(90, 0);
    expect(at(true)).toBeCloseTo(113, 0);
  });
});

// Ülke hücresi boşsa o ülkede genel fiyat geçer; genel fiyat hücreye yazılsaydı hücre "genel" yerine kendi fiyatı varmış gibi görünür
// ve "genel'e dön" sunardı.
describe('countryCellsOf', () => {
  const price = (amountCents: number, country: 'FR' | 'DE' | null) =>
    ({ amountCents, country, validFrom: '2026-10-01T00:00:00Z' }) as unknown as Price;

  it('yalnız ülke fiyatı ülke hücresine yazılır; genel fiyat iki kanalda da hücreye sızmaz', () => {
    const b2c = new Map([
      ['v1', { general: price(690, null), byCountry: { DE: price(750, 'DE') } }],
      ['v2', { general: price(1240, null), byCountry: {} }],
    ]);
    const b2b = new Map([
      ['v1', { general: price(520, null), byCountry: {} }],
      ['v2', { general: price(930, null), byCountry: { DE: price(900, 'DE') } }],
    ]);
    expect(countryCellsOf('v1', b2c, b2b).DE).toMatchObject({ b2c: { amountCents: 750 }, b2b: { amountCents: null } });
    expect(countryCellsOf('v2', b2c, b2b).DE).toMatchObject({ b2c: { amountCents: null }, b2b: { amountCents: 900 } });
  });
});

// Pencerede boşaltılan ülke alanı ülke fiyatını kaldırmalı; kaldırmasaydı eski Almanya fiyatı geçmeye devam ederdi.
describe('countryPriceWrites', () => {
  const saved = { DE: { b2c: { amountCents: 750, validFrom: null }, b2b: { amountCents: null, validFrom: null } } };

  it('boşaltılan alan kaldırılır, değişmeyen yazılmaz, yeni tutar yazılır', () => {
    expect(countryPriceWrites({ DE: { b2c: null, b2b: null } }, saved)).toEqual([{ kind: 'remove', country: 'DE', channel: 'b2c' }]);
    expect(countryPriceWrites({ DE: { b2c: 7.5, b2b: 5.9 } }, saved)).toEqual([
      { kind: 'write', country: 'DE', channel: 'b2b', amountCents: 590 },
    ]);
  });
});
