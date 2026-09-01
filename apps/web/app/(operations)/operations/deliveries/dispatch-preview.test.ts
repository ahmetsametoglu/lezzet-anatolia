import { describe, expect, it } from 'vitest';
import { runPreviewOf, type PreviewOrder, type PreviewRun } from './dispatch-preview';

/**
 * Sevkiyat masasındaki tur önizlemesinin eşlemesi (11.9).
 *
 * Haritanın ÇİZİMİ `route-map-model.test.ts`in konusu (tur yolu, çerçeve, künye cümlesi); burada
 * sınanan şey ondan önceki adım: veritabanı satırlarının haritanın modeline nasıl döndüğü.
 */
const RUN_ID = 'run-1';

const run = (over: Partial<PreviewRun> = {}): PreviewRun => ({
  id: RUN_ID,
  stopOrder: ['o2', 'o1'],
  stopOrderMetric: 'haversine',
  stopOrderPrecision: 'address',
  ...over,
});

const order = (id: string, over: Partial<PreviewOrder> = {}): PreviewOrder => ({
  id,
  deliveryRunId: RUN_ID,
  referenceNo: `LA-26-${id.toUpperCase()}`,
  addressSnapshot: { line1: `${id} rue du Test`, city: 'Strasbourg', lat: 48.6, lng: 7.75 },
  ...over,
});

const DEPO = { lat: 48.578, lng: 7.742, name: 'Strasbourg deposu' };

describe('runPreviewOf · sıradaki yer', () => {
  it('numara `stop_order` dizisindeki YERDEN gelir, okuma sırasından değil', () => {
    // Okuma sırası siparişin verilme sırasıdır ve tam olarak bu ekranın YALANLADIĞI şey.
    const preview = runPreviewOf({ run: run(), orders: [order('o1'), order('o2')], depot: DEPO });

    expect(preview?.stops.find((s) => s.orderId === 'o1')?.sequence).toBe(2);
    expect(preview?.stops.find((s) => s.orderId === 'o2')?.sequence).toBe(1);
  });

  it('dizide OLMAYAN durak düşmez, numarasız kalır', () => {
    // Gün ortasında eklenen sipariş sıraya girmemiş olabilir. Haritadan silmek onu gizlemek olurdu;
    // uydurma bir numara vermek ölçülmemiş bir sırayı ölçülmüş gibi göstermek.
    const preview = runPreviewOf({ run: run(), orders: [order('o1'), order('o2'), order('o9')], depot: DEPO });

    expect(preview?.stops).toHaveLength(3);
    expect(preview?.stops.find((s) => s.orderId === 'o9')?.sequence).toBeNull();
  });

  it('BAŞKA seferin durağı bu haritaya girmez', () => {
    const preview = runPreviewOf({
      run: run(),
      orders: [order('o1'), order('o2'), order('yabanci', { deliveryRunId: 'run-2' })],
      depot: DEPO,
    });

    expect(preview?.stops.map((s) => s.orderId)).toEqual(['o1', 'o2']);
  });
});

describe('runPreviewOf · eksik ölçüm', () => {
  it('sıra HESAPLANMAMIŞSA önizleme yok — boş harita çizilmez', () => {
    expect(runPreviewOf({ run: run({ stopOrderMetric: null }), orders: [order('o1')], depot: DEPO })).toBeNull();
    expect(runPreviewOf({ run: run({ stopOrderPrecision: null }), orders: [order('o1')], depot: DEPO })).toBeNull();
  });

  it('koordinatsız durak haritaya GİRMEZ — (0, 0) Atlantik\'tir', () => {
    /*
      `Number(null)` sıfırdır ve hiçbir tip bunu yakalamaz. İşaret Gine Körfezi'ne düşer, `fitBounds`
      bütün haritayı oraya kadar açar ve turun şekli görünmez hâle gelir — üstelik eksik ölçüm
      sağlıklı gibi okunur (`CLAUDE §1`).
    */
    const preview = runPreviewOf({
      run: run(),
      orders: [order('o1'), order('o2', { addressSnapshot: { line1: '5 rue X', city: 'Strasbourg' } })],
      depot: DEPO,
    });

    expect(preview?.stops.map((s) => s.orderId)).toEqual(['o1']);
  });

  it('HİÇ koordinatlı durak yoksa önizleme yok', () => {
    const preview = runPreviewOf({
      run: run(),
      orders: [order('o1', { addressSnapshot: null })],
      depot: DEPO,
    });

    expect(preview).toBeNull();
  });

  it('deponun noktası yoksa çıpa `null` kalır — merkez UYDURULMAZ', () => {
    const yarim = runPreviewOf({ run: run(), orders: [order('o1')], depot: { lat: null, lng: null, name: 'Depo' } });
    const yok = runPreviewOf({ run: run(), orders: [order('o1')], depot: null });

    expect(yarim?.origin).toBeNull();
    expect(yok?.origin).toBeNull();
    // Duraklar yine çizilir: çıpa yokluğu turu açık bırakır, haritayı boşaltmaz.
    expect(yok?.stops).toHaveLength(1);
  });
});

describe('runPreviewOf · künye', () => {
  it('ölçü ve incelik olduğu gibi taşınır — ekran onları yazacak', () => {
    const preview = runPreviewOf({
      run: run({ stopOrderMetric: 'matrix', stopOrderPrecision: 'mixed' }),
      orders: [order('o1')],
      depot: DEPO,
    });

    expect(preview).toMatchObject({ metric: 'matrix', precision: 'mixed' });
  });

  it('adres satırı yoksa etiket REFERANS NUMARASINA düşer, boş kalmaz', () => {
    const preview = runPreviewOf({
      run: run(),
      orders: [order('o1', { addressSnapshot: { lat: 48.6, lng: 7.75 } })],
      depot: DEPO,
    });

    expect(preview?.stops[0]?.label).toBe('LA-26-O1');
  });

  it('depo noktası METİN gelse de sayıya çevrilir — `numeric` kolonu dize döndürebilir', () => {
    // PostgREST `numeric(9,6)` kolonlarını dize olarak verebiliyor; Leaflet dizeyi kabul etmez ve
    // harita sessizce boş çizilirdi.
    const preview = runPreviewOf({
      run: run(),
      orders: [order('o1')],
      depot: { lat: '48.578000', lng: '7.742000', name: 'Depo' },
    });

    expect(preview?.origin).toEqual({ lat: 48.578, lng: 7.742, label: 'Depo' });
  });
});
