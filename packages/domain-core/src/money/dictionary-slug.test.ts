import { describe, expect, it } from 'vitest';
import { dictionarySlugOf } from './dictionary-slug';

describe('sözlük slug kuralı (12.12 · 13.09)', () => {
  it('Türkçe harfleri ASCII yapar, küçültür, boşluğu ayraca çevirir', () => {
    expect(dictionarySlugOf('Akaryakıt')).toBe('akaryakit');
    expect(dictionarySlugOf('Sosyal Güvenlik')).toBe('sosyal-guvenlik');
    expect(dictionarySlugOf('ŞİRKET Gideri')).toBe('sirket-gideri');
    expect(dictionarySlugOf('Ödünç / Avans')).toBe('odunc-avans');
  });

  it('Fransızca aksanları da taban harfe indirir', () => {
    expect(dictionarySlugOf('Frais bancaires — Crédit')).toBe('frais-bancaires-credit');
  });

  it('iki nokta artık ayraçtır — ortak ön eki kalktı, slug yalnız harf, rakam ve tire', () => {
    expect(dictionarySlugOf('ortak:ahmet')).toBe('ortak-ahmet');
  });

  it('boş ya da yalnız ayraç kalan ad slug üretmez — uydurulmaz', () => {
    expect(dictionarySlugOf('   ')).toBeNull();
    expect(dictionarySlugOf('---')).toBeNull();
    expect(dictionarySlugOf('!!!')).toBeNull();
  });
});
