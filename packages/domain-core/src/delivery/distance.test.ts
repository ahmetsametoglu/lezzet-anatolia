import { describe, expect, it } from 'vitest';
import { distanceKm, nearestOf } from './distance';

/**
 * Mesafe motoru (22.7) — asistanın bölge önerisinin tek sayısal dayanağı.
 *
 * Sınanan şey ondalık hassasiyet DEĞİL: sıralama doğruluğu ve **ölçülemeyenin sıfıra düşmemesi**.
 * Yanlış sıralama, aracın her hafta boşa gittiği bir durak demektir; sıfıra düşen bir ölçüm ise
 * koordinatsız bir kodu "en yakın" yapar ve bunu kimse fark etmez.
 */

// Gerçek noktalar — Strasbourg çevresi (kaba ama sıralaması gerçek).
const STRASBOURG = { lat: 48.5734, lng: 7.7521 };
const KEHL = { lat: 48.5716, lng: 7.8155 }; // ~4-5 km, sınırın öbür yakası
const COLMAR = { lat: 48.0794, lng: 7.3585 }; // ~60 km güney
const PARIS = { lat: 48.8566, lng: 2.3522 }; // ~400 km batı

describe('kuş uçuşu mesafe', () => {
  it('aynı nokta SIFIR, komşu şehir onlarca km, uzak şehir yüzlerce', () => {
    expect(distanceKm(STRASBOURG, STRASBOURG)).toBeCloseTo(0, 5);
    // Kehl sınırın hemen ötesi: 10 km'nin altında olmalı.
    expect(distanceKm(STRASBOURG, KEHL)!).toBeLessThan(10);
    expect(distanceKm(STRASBOURG, COLMAR)!).toBeGreaterThan(50);
    expect(distanceKm(STRASBOURG, PARIS)!).toBeGreaterThan(350);
  });

  it('simetriktir — yön değişince mesafe değişmez', () => {
    expect(distanceKm(STRASBOURG, COLMAR)).toBeCloseTo(distanceKm(COLMAR, STRASBOURG)!, 6);
  });

  /** Koordinatsız kod GERÇEK bir hâl: `postal_code_place.lat/lng` nullable ve dolmayan satır var. */
  it('koordinat yoksa NULL — sıfır değil (sıfır "aynı yerde" demek olurdu)', () => {
    expect(distanceKm(null, STRASBOURG)).toBeNull();
    expect(distanceKm(STRASBOURG, undefined)).toBeNull();
    expect(distanceKm({ lat: Number.NaN, lng: 7 }, STRASBOURG)).toBeNull();
  });
});

describe('en yakın aday', () => {
  it('en yakını seçer ve mesafesini söyler', () => {
    const best = nearestOf(STRASBOURG, [
      { item: 'colmar', point: COLMAR },
      { item: 'kehl', point: KEHL },
      { item: 'paris', point: PARIS },
    ]);
    expect(best?.item).toBe('kehl');
    expect(best?.distanceKm).toBeLessThan(10);
  });

  /**
   * Koordinatsız aday ELENİR. Sıfır sayılsaydı listedeki ilk koordinatsız kayıt her zaman "en
   * yakın" çıkardı — ve öneri, hakkında hiçbir şey bilinmeyen bir hatta giderdi.
   */
  it('koordinatsız aday elenir; hiçbirinde koordinat yoksa NULL', () => {
    const best = nearestOf(STRASBOURG, [
      { item: 'bilinmeyen', point: null },
      { item: 'colmar', point: COLMAR },
    ]);
    expect(best?.item).toBe('colmar');

    expect(nearestOf(STRASBOURG, [{ item: 'a', point: null }])).toBeNull();
    expect(nearestOf(null, [{ item: 'a', point: COLMAR }])).toBeNull();
    expect(nearestOf(STRASBOURG, [])).toBeNull();
  });
});
