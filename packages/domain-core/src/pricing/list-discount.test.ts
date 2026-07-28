import { describe, expect, it } from 'vitest';
import { discountPercentOf, priceFromDiscountPercent } from './list-discount';

describe('discountPercentOf', () => {
  it('fiyatın listeye göre oranını geri okur', () => {
    expect(discountPercentOf(1800, 1260)).toBeCloseTo(30);
  });

  it('fiyat listeden pahalıysa NEGATİF döner — zam da bir karardır, gizlenmez', () => {
    expect(discountPercentOf(1000, 1200)).toBeCloseTo(-20);
  });

  it('liste yoksa oran YOKTUR — uydurma taban yok', () => {
    expect(discountPercentOf(null, 1200)).toBeNull();
    expect(discountPercentOf(0, 1200)).toBeNull();
    expect(discountPercentOf(1000, null)).toBeNull();
  });
});

describe('priceFromDiscountPercent', () => {
  it('yüzdeyi fiyata çevirir', () => {
    expect(priceFromDiscountPercent(2000, 25)).toBe(1500);
  });

  it('indirimi AŞAĞI yuvarlar — söylenen oranın altına düşmez', () => {
    // 1795 − %30 (538,5 → 538) = 1257; yukarı yuvarlansa 1256 olurdu (istenenden fazla indirim).
    expect(priceFromDiscountPercent(1795, 30)).toBe(1257);
  });

  it('negatif yüzde ZAMDIR — fiyat listenin üstüne çıkar', () => {
    expect(priceFromDiscountPercent(1000, -20)).toBe(1200);
  });

  it('fiyat sıfırın altına inmez', () => {
    expect(priceFromDiscountPercent(1000, 150)).toBe(0);
  });

  it('liste yoksa fiyat da yok', () => {
    expect(priceFromDiscountPercent(null, 30)).toBeNull();
    expect(priceFromDiscountPercent(0, 30)).toBeNull();
  });

  it('iki yön birbirini geri verir (yuvarlama payıyla)', () => {
    const price = priceFromDiscountPercent(1800, 30)!;
    expect(discountPercentOf(1800, price)).toBeCloseTo(30, 1);
  });
});
