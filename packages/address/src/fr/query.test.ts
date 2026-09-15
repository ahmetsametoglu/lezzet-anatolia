import { describe, expect, it } from 'vitest';
import { houseNumberFirst } from './query';

describe('houseNumberFirst', () => {
  it('sondaki numarayı başa alır — ekleriyle, virgülle; posta kodu yerinde kalır', () => {
    expect(houseNumberFirst('rue du Maréchal Foch 192c')).toBe('192c rue du Maréchal Foch');
    expect(houseNumberFirst('rue du Maréchal Foch 192')).toBe('192 rue du Maréchal Foch');
    expect(houseNumberFirst('Rue des Orfèvres 12 bis')).toBe('12 bis Rue des Orfèvres');
    expect(houseNumberFirst('rue des Orfèvres, 12')).toBe('12 rue des Orfèvres');
    expect(houseNumberFirst('rue des Orfèvres 12 67000')).toBe('12 rue des Orfèvres 67000');
  });

  it('numara zaten baştaysa ya da hiç yoksa ikinci soru yok', () => {
    expect(houseNumberFirst('12 rue des Orfèvres')).toBeNull();
    expect(houseNumberFirst('rue des Orfèvres')).toBeNull();
    expect(houseNumberFirst('67000')).toBeNull();
    expect(houseNumberFirst('12')).toBeNull();
  });
});
