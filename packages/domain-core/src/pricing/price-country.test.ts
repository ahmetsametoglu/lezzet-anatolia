import { describe, expect, it } from 'vitest';
import { priceCountryOf } from './price-country';

describe('fiyat ülkesi', () => {
  it('yer biliniyorsa dilden bağımsız olarak yerin ülkesi okunur', () => {
    expect(priceCountryOf('DE', 'fr')).toBe('DE');
    expect(priceCountryOf('FR', 'de')).toBe('FR');
  });

  it('yer yokken Almanca arayüz Almanya fiyatını okur', () => {
    expect(priceCountryOf(null, 'de')).toBe('DE');
  });

  it('yer yokken Fransızca ve Türkçe arayüz genel fiyatı okur', () => {
    expect(priceCountryOf(null, 'fr')).toBeNull();
    expect(priceCountryOf(null, 'tr')).toBeNull();
  });
});
