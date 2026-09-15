import { describe, expect, it } from 'vitest';
import { hasHouseNumber } from './house-number';

describe('hasHouseNumber', () => {
  it('numarasız sokakta ve yalnız posta kodunda kapı numarası yok', () => {
    expect(hasHouseNumber('Rue du Maréchal Foch')).toBe(false);
    expect(hasHouseNumber('67000')).toBe(false);
    expect(hasHouseNumber('67000 Strasbourg')).toBe(false);
    expect(hasHouseNumber('Rue du Maréchal Foch 67000 Strasbourg')).toBe(false);
  });

  it('Fransız ve Alman yazımında kapı numarasını görür', () => {
    expect(hasHouseNumber('192c rue du Maréchal Foch')).toBe(true);
    expect(hasHouseNumber('12 Rue des Orfèvres 67000')).toBe(true);
    expect(hasHouseNumber('Hauptstraße 12')).toBe(true);
  });
});
