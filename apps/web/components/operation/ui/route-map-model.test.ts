import { describe, expect, it } from 'vitest';

import { allPoints, hasSequence, metricNote, tourPath, type RouteMapStop } from './route-map-model';

const DEPO = { lat: 48.5839, lng: 7.7455, label: 'Strasbourg deposu' };

const durak = (sequence: number | null, lat: number): RouteMapStop => ({
  orderId: `o${sequence ?? 'x'}-${lat}`,
  sequence,
  lat,
  lng: 7.75,
  label: `Durak ${sequence ?? '—'}`,
});

describe('tourPath', () => {
  it('depodan çıkar, sıraya göre gezer, depoya döner', () => {
    // Kapalı tur: dönüş bacağı çizginin parçasıdır ve hesabın da parçasıydı.
    const path = tourPath({ origin: DEPO, stops: [durak(2, 48.62), durak(1, 48.6)] });

    expect(path.map((p) => p.lat)).toEqual([48.5839, 48.6, 48.62, 48.5839]);
  });

  it('SIRASIZ durak yola girmez', () => {
    // Çizgiye katmak, olmayan bir sırayı varmış gibi göstermek olurdu. Durak haritada kalır —
    // sadece tura dahil edilmez.
    const path = tourPath({ origin: DEPO, stops: [durak(1, 48.6), durak(null, 48.7)] });

    expect(path.map((p) => p.lat)).toEqual([48.5839, 48.6, 48.5839]);
  });

  it('hiç sıralı durak yoksa çizgi de yok', () => {
    expect(tourPath({ origin: DEPO, stops: [durak(null, 48.6)] })).toEqual([]);
  });

  it('depo noktası yoksa tur açık kalır — uydurma çıpa yok', () => {
    const path = tourPath({ origin: null, stops: [durak(1, 48.6), durak(2, 48.62)] });

    expect(path.map((p) => p.lat)).toEqual([48.6, 48.62]);
  });
});

describe('allPoints', () => {
  it('çerçeveye sırasız duraklar da girer — haritada görünmeleri gerekiyor', () => {
    const points = allPoints({ origin: DEPO, stops: [durak(1, 48.6), durak(null, 48.9)] });

    expect(points).toHaveLength(3);
    expect(points.some((p) => p.lat === 48.9)).toBe(true);
  });
});

describe('hasSequence', () => {
  it('tek bir sıralı durak yeter', () => {
    expect(hasSequence([durak(null, 48.6), durak(3, 48.7)])).toBe(true);
    expect(hasSequence([durak(null, 48.6)])).toBe(false);
  });
});

describe('metricNote', () => {
  it('ölçüyü ve inceliği okunur dille söyler', () => {
    // Kuş uçuşuyla dizilmiş bir sıra ile yol süresiyle dizilmiş olan haritada AYNI görünür;
    // farkı yalnız bu satır söyler.
    expect(metricNote({ metric: 'haversine', precision: 'address' })).toBe('Sıra kuş uçuşu ölçüsüyle, kapı düzeyinde.');
    expect(metricNote({ metric: 'matrix', precision: 'postal_centroid' })).toBe('Sıra yol süresi ölçüsüyle, posta kodu düzeyinde.');
    expect(metricNote({ metric: 'haversine', precision: 'mixed' })).toBe('Sıra kuş uçuşu ölçüsüyle, karışık çözünürlükte.');
  });

  it('sıra hesaplanmadıysa bunu AÇIKÇA söyler', () => {
    expect(metricNote({ metric: null, precision: null })).toBe('Sıra hesaplanmadı — duraklar liste sırasında.');
  });
});
