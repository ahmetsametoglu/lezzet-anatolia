import { describe, it, expect } from 'vitest';
import { slugify, uniqueSlug } from './slug';

describe('slugify', () => {
  it('Türkçe karakterleri sadeleştirir', () => {
    expect(slugify('Su Böreği')).toBe('su-boregi');
    expect(slugify('İçli Köfte')).toBe('icli-kofte');
    expect(slugify('Ispanaklı Gözleme')).toBe('ispanakli-gozleme');
  });

  it('Fransızca/Almanca aksanlarını sadeleştirir', () => {
    expect(slugify('Crème brûlée')).toBe('creme-brulee');
    expect(slugify('Weißwurst')).toBe('weisswurst');
    expect(slugify('Bœuf')).toBe('boeuf');
  });

  it('boşluk/sembolleri tek tireye indirir, uçları kırpar', () => {
    expect(slugify('  Merhaba,  Dünya! ')).toBe('merhaba-dunya');
    expect(slugify('a---b')).toBe('a-b');
  });
});

describe('uniqueSlug', () => {
  it('boştaysa taban slug döner', () => {
    expect(uniqueSlug('Yeni Ürün', () => false)).toBe('yeni-urun');
  });

  it('çakışmada sayısal ek verir', () => {
    const taken = new Set(['su-boregi', 'su-boregi-2']);
    expect(uniqueSlug('Su Böreği', (s) => taken.has(s))).toBe('su-boregi-3');
  });

  it('tamamen boşalan girdide güvenli tabana düşer', () => {
    expect(uniqueSlug('🎉', () => false)).toBe('x');
  });
});
