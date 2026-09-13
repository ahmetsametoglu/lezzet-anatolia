import { describe, expect, it } from 'vitest';
import { isPartnerTag, tagSlugOf } from './tag-slug';

describe('etiket slug kuralı (12.12)', () => {
  it('Türkçe harfleri ASCII yapar, küçültür, boşluğu ayraca çevirir', () => {
    expect(tagSlugOf('Akaryakıt')).toBe('akaryakit');
    expect(tagSlugOf('Bordro Kesintisi')).toBe('bordro-kesintisi');
    expect(tagSlugOf('ŞİRKET Gideri')).toBe('sirket-gideri');
    expect(tagSlugOf('Ödünç / Avans')).toBe('odunc-avans');
  });

  it('Fransızca aksanları da taban harfe indirir', () => {
    expect(tagSlugOf('Frais bancaires — Crédit')).toBe('frais-bancaires-credit');
  });

  it('ortak etiketi ön ek alır ve ön ekten tanınır', () => {
    expect(tagSlugOf('Ahmet', { partner: true })).toBe('ortak:ahmet');
    expect(isPartnerTag('ortak:ahmet')).toBe(true);
    expect(isPartnerTag('maas')).toBe(false);
  });

  it('boş ya da yalnız ayraç kalan ad slug üretmez — uydurulmaz', () => {
    expect(tagSlugOf('   ')).toBeNull();
    expect(tagSlugOf('---')).toBeNull();
    expect(tagSlugOf('!!!', { partner: true })).toBeNull();
  });
});
