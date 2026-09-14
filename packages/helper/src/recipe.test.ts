import { describe, expect, it } from 'vitest';
import { formatPrice } from './format';
import { recipeRowMetaOf } from './recipe';

/*
  TARİF SATIRININ ALT METNİ — native tarif detayı ve web telefon görünümü aynı cümleyi kurar (terfi 14.09).
  Çiviler native künyesinin iki kuralı: adet yalnız birden çoksa yazılır; eksik parça uydurulmaz, düşer.
*/

describe('recipeRowMetaOf', () => {
  it('tek adette adet yazılmaz: boy · fiyat', () => {
    expect(recipeRowMetaOf({ qty: 1, label: '500 g', priceCents: 1290 }, 'fr')).toBe(`500 g · ${formatPrice(1290, 'fr')}`);
  });

  it('birden çok adette "N ×" öneki boyun önünde', () => {
    expect(recipeRowMetaOf({ qty: 2, label: '500 g', priceCents: 1290 }, 'tr')).toBe(`2 × 500 g · ${formatPrice(1290, 'tr')}`);
  });

  it('boş parça düşer — tek boylu üründe etiket, fiyatsız satırda fiyat ("0,00 €" yazılmaz)', () => {
    expect(recipeRowMetaOf({ qty: 1, label: '', priceCents: 450 }, 'fr')).toBe(formatPrice(450, 'fr'));
    expect(recipeRowMetaOf({ qty: 3, label: '', priceCents: null }, 'de')).toBe('3 ×');
    expect(recipeRowMetaOf({ qty: 1, label: '', priceCents: null }, 'fr')).toBe('');
  });
});
