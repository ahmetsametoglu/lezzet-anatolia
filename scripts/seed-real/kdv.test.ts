import { describe, expect, it } from 'vitest';
import { kdvSorunlari } from './kdv';

describe('KDV tablosu', () => {
  // İstisnadaki ad ya da kod beslemede yoksa istisna sessizce düşer ve ürün kategorisinin oranıyla satılır.
  it('her kategorinin oranı var, istisnadaki her ürün beslemede ve tek grupta', () => {
    expect(kdvSorunlari()).toEqual([]);
  });
});
