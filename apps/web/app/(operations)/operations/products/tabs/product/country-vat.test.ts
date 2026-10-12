import { describe, expect, it } from 'vitest';
import { choiceOf, countryVatOptions, countryVatWrite } from './country-vat';

// Boş seçim sıfır oran sayılsaydı ürün Almanya'da %0 KDV ile satılabilir olurdu; değişmeyen oranı yeniden yazmak da gereksiz bir tur.
describe('countryVatWrite', () => {
  it('boşaltılan oran kaldırılır, sıfır yazılmaz', () => {
    expect(countryVatWrite(7, '')).toEqual({ rate: null });
  });

  it('yeni oran yazılır, değişmeyen oran yazılmaz', () => {
    expect(countryVatWrite(null, '7')).toEqual({ rate: 7 });
    expect(countryVatWrite(7, '19')).toEqual({ rate: 19 });
    expect(countryVatWrite(7, choiceOf(7))).toBeNull();
    expect(countryVatWrite(null, choiceOf(null))).toBeNull();
  });
});

describe('countryVatOptions', () => {
  it('listede olmayan kayıtlı oran seçeneklere eklenir, yoksa anahtar onu "yok" diye gösterirdi', () => {
    expect(countryVatOptions('DE', 5.5, false).map((option) => option.key)).toEqual(['', '7', '19', '5.5']);
    expect(countryVatOptions('DE', 7, false).map((option) => option.key)).toEqual(['', '7', '19']);
  });
});
