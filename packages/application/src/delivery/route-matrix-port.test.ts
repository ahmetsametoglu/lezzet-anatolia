import { describe, expect, it } from 'vitest';

import { costOfMatrix, type RouteMatrix } from './route-matrix-port';

const matrixOf = (durationsSec: (number | null)[][]): RouteMatrix => ({ durationsSec, source: 'osrm' });

describe('costOfMatrix', () => {
  it('simetrik matriste değeri olduğu gibi verir', () => {
    const cost = costOfMatrix(matrixOf([
      [0, 100, 200],
      [100, 0, 150],
      [200, 150, 0],
    ]));

    expect(cost?.(0, 1)).toBe(100);
    expect(cost?.(1, 2)).toBe(150);
  });

  it('ASİMETRİK matrisi simetrikleştirir — 2-opt aksi hâlde geçersiz olurdu', () => {
    /*
      Gerçek yol matrisinde A→B ≠ B→A (tek yön, orta refüj). 2-opt bir dilimi TERS ÇEVİRİR, yani
      ters çevrilen kenarların YÖNÜNÜ değiştirir; asimetrik maliyette hesabı geçersizdir ve bunu
      hiçbir test yakalamaz — tur yalnız sessizce yanlış olur. Ortalama, hesabı geçerli kılan
      tek yol; bedeli tek yönlü sokakta gerçek süreden sapmaktır.
    */
    const cost = costOfMatrix(matrixOf([
      [0, 100, 0],
      [300, 0, 0],
      [0, 0, 0],
    ]));

    expect(cost?.(0, 1)).toBe(200);
    expect(cost?.(1, 0)).toBe(200);
  });

  it('tek ÖLÇÜLEMEYEN hücre tüm matrisi reddeder', () => {
    // Eksik hücreyi "çok pahalı" saymak ölçülemeyen bir şeye sayı uydurmak, sıfır saymak daha da
    // kötüsü olurdu — ölçülemeyen bacak en ucuz bacak sanılırdı.
    const cost = costOfMatrix(matrixOf([
      [0, 100],
      [null, 0],
    ]));

    expect(cost).toBeNull();
  });

  it('boş matris kabul edilir — sıfır durak bir hata değil', () => {
    expect(costOfMatrix(matrixOf([]))).not.toBeNull();
  });
});
