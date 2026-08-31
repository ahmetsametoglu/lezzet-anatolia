import { describe, expect, it } from 'vitest';

import { plausiblePoint, pointVerdict, warehousePoint, warehousePostalCode } from './geo-point';

const STRASBOURG = { lat: 48.5734, lng: 7.7521 };

describe('pointVerdict', () => {
  it('merkeze yakın nokta kabul edilir', () => {
    expect(pointVerdict({ point: { lat: 48.58, lng: 7.75 }, centroid: STRASBOURG })).toBe('ok');
  });

  it('merkeze çok uzak nokta REDDEDİLİR', () => {
    // Paris — kod Strasbourg'unki. Tipik sebep: form alanları karışmış ya da öneri yanlış eşleşmiş.
    expect(pointVerdict({ point: { lat: 48.8566, lng: 2.3522 }, centroid: STRASBOURG })).toBe('too_far');
  });

  it('enlem/boylam ters yazılmışsa yakalanır', () => {
    // En sinsi hata: `[boylam, enlem]` sırası karıştığında nokta Gine Körfezi'ne düşer ve HİÇBİR
    // tip bunu görmez. Sınır kutusu son savunma hattıdır.
    expect(pointVerdict({ point: { lat: 7.7521, lng: 48.5734 }, centroid: STRASBOURG })).toBe('out_of_bounds');
  });

  it('(0, 0) kabul edilmez — sıfır bir konum değildir', () => {
    expect(pointVerdict({ point: { lat: 0, lng: 0 }, centroid: STRASBOURG })).toBe('out_of_bounds');
  });

  it('bozuk sayı reddedilir', () => {
    expect(pointVerdict({ point: { lat: Number.NaN, lng: 7.75 } })).toBe('not_finite');
    expect(pointVerdict({ point: null })).toBe('not_finite');
  });

  it('merkez bilinmiyorsa "uzak mı" ÖLÇÜLEMEZ — nokta atılmaz', () => {
    // Kendi referansı olmayan bir posta kodu yüzünden gerçek bir koordinatı çöpe atmak, elde olan
    // tek ölçümü kaybetmek olurdu. Sınır kutusu yine de çalışıyor (üstteki testler).
    expect(pointVerdict({ point: { lat: 48.58, lng: 7.75 }, centroid: null })).toBe('ok');
  });

  it('eşik parametrik', () => {
    const nearby = { lat: 48.71, lng: 7.75 }; // merkeze ~15 km

    expect(plausiblePoint({ point: nearby, centroid: STRASBOURG })).toBe(true);
    expect(plausiblePoint({ point: nearby, centroid: STRASBOURG, maxDriftKm: 5 })).toBe(false);
  });
});

describe('warehousePostalCode', () => {
  it('iki yazım da okunur — jsonb şekli hiçbir yerde zorlanmıyor', () => {
    expect(warehousePostalCode({ postalCode: '67000' })).toBe('67000');
    expect(warehousePostalCode({ postal_code: '67000' })).toBe('67000');
  });

  it('boş/eksik hâlde null — uydurma kod yok', () => {
    expect(warehousePostalCode(null)).toBeNull();
    expect(warehousePostalCode({})).toBeNull();
    expect(warehousePostalCode({ postalCode: '   ' })).toBeNull();
    expect(warehousePostalCode({ postalCode: 67000 })).toBeNull();
  });
});

describe('warehousePoint', () => {
  it('kendi kolonu her zaman kazanır', () => {
    // Operatörün haritada onayladığı nokta, posta kodunun ortalamasından iyidir.
    const point = warehousePoint({
      lat: 48.6,
      lng: 7.8,
      address: { postalCode: '67000' },
      centroidOf: () => STRASBOURG,
    });

    expect(point).toEqual({ lat: 48.6, lng: 7.8 });
  });

  it('kolon boşsa posta kodu merkezine düşer', () => {
    const point = warehousePoint({ address: { postalCode: '67000' }, centroidOf: () => STRASBOURG });

    expect(point).toEqual(STRASBOURG);
  });

  it('ikisi de yoksa null — motor sebebini söyleyebilsin', () => {
    expect(warehousePoint({ address: null })).toBeNull();
    expect(warehousePoint({ address: { postalCode: '67000' }, centroidOf: () => null })).toBeNull();
    expect(warehousePoint({ lat: 48.6, lng: null })).toBeNull();
  });
});
