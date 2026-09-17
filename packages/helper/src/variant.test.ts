import { describe, expect, it } from 'vitest';
import { openingVariantOf } from './variant';

const small = { id: 'kucuk' };
const large = { id: 'buyuk' };
const variants = [small, large];

describe('openingVariantOf', () => {
  it('bağlantının istediği boy aktifse sayfa o boyla açılır — paketteki boy en ucuz boy olmayabilir', () => {
    expect(openingVariantOf(variants, 'buyuk', 'kucuk')).toBe(large);
  });

  it('istenen boy ürünün aktif boyları arasında değilse birincil boya düşer', () => {
    expect(openingVariantOf(variants, 'satistan-kalkmis', 'buyuk')).toBe(large);
    expect(openingVariantOf(variants, null, 'buyuk')).toBe(large);
  });

  it('birincil boy da yoksa sıranın ilki; boysuz üründe hiçbiri', () => {
    expect(openingVariantOf(variants, null, null)).toBe(small);
    expect(openingVariantOf([], 'buyuk', 'kucuk')).toBeUndefined();
  });
});
