import { describe, expect, it } from 'vitest';
import { formatPrice } from './format';

/*
  Beklenen dizgeler elle yazılır, `Intl`le üretilmez: aynı hatayı iki kez yapan bir beklenti hep yeşil kalırdı. Boşluklar kaçış
  dizisiyle yazılır, çünkü normal, bölünmeyen (U+00A0) ve dar bölünmeyen (U+202F) boşluk ekranda aynı görünür.
*/
const NBSP = ' ';
const NARROW_NBSP = ' ';

describe('formatPrice — cihazda biçimlenen cent', () => {
  it('cent → euro, iki basamak, simge SONDA (üç dilde de aynı yazım)', () => {
    expect(formatPrice(1290, 'fr')).toBe(`12,90${NBSP}€`);
    expect(formatPrice(1290, 'tr')).toBe(`12,90${NBSP}€`);
    expect(formatPrice(1290, 'de')).toBe(`12,90${NBSP}€`);
  });

  it('binlik ayracı DİLİN kendi ayracıdır (fr boşluk, tr/de nokta)', () => {
    expect(formatPrice(123450, 'fr')).toBe(`1${NARROW_NBSP}234,50${NBSP}€`);
    expect(formatPrice(123450, 'tr')).toBe(`1.234,50${NBSP}€`);
    expect(formatPrice(123450, 'de')).toBe(`1.234,50${NBSP}€`);
  });

  it('tam sayı tutar da iki basamakla yazılır (raf fiyatı "8 €" değil "8,00 €")', () => {
    expect(formatPrice(800, 'fr')).toBe(`8,00${NBSP}€`);
  });

  it('sıfır tutar gizlenmez — 0,00 € bir fiyattır, yokluk değil', () => {
    expect(formatPrice(0, 'tr')).toBe(`0,00${NBSP}€`);
  });
});
