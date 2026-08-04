import { describe, expect, it } from 'vitest';
import type { AnalyticsDaily } from '@lezzet/types';
import { changeRatio, deltaView, sumEvents, toFunnel, toHeat, toSeries } from './analytics-read';

/**
 * Özet satırı → blok indirgemeleri. Saf mantık, DB yok → birim test.
 *
 * Bu dosyanın asıl koruduğu şey bir SAYI DEĞİL, bir DÜRÜSTLÜK: analitikte yanlış bir toplama hata
 * vermez, yalnız inandırıcı bir yanlış sayı üretir. Testler o yanlışların her birini adıyla tutuyor.
 */

const row = (over: Partial<AnalyticsDaily>): AnalyticsDaily => ({
  day: '2026-08-01',
  type: 'page_view',
  path: null,
  warehouseId: null,
  channel: null,
  availability: null,
  // Özet 04.08'de terk sebebi boyutu kazandı (0035 · arka uç şeridi); fabrikanın varsayılanı `null`.
  blockedReason: null,
  eventCount: 0,
  sessionCount: 0,
  hourly: new Array<number>(24).fill(0),
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

describe('sumEvents', () => {
  it('yalnız istenen tipi toplar', () => {
    const rows = [row({ type: 'page_view', eventCount: 10 }), row({ type: 'add_to_cart', eventCount: 4 })];
    expect(sumEvents(rows, 'page_view')).toBe(10);
    expect(sumEvents(rows, 'add_to_cart')).toBe(4);
    expect(sumEvents(rows, 'order_placed')).toBe(0);
  });
});

describe('changeRatio', () => {
  it('önceki dönem SIFIRSA oran tanımsızdır', () => {
    // "%∞ arttı" bir bilgi değildir; ekran bu hâlde kıyas rozetini hiç çizmemeli.
    expect(changeRatio(50, 0)).toBeNull();
  });

  it('artış ve düşüş işaretlidir', () => {
    expect(changeRatio(110, 100)).toBeCloseTo(0.1);
    expect(changeRatio(90, 100)).toBeCloseTo(-0.1);
  });
});

describe('deltaView', () => {
  it('yönün İYİ olup olmadığı ölçüye göre değişir', () => {
    // Ziyaret artışı iyidir…
    expect(deltaView(0.2, true)?.tone).toBe('olive');
    // …terk oranı artışı değildir. Aynı sayı, ters anlam.
    expect(deltaView(0.2, false)?.tone).toBe('red');
  });

  it('değişmediğinde nötr konuşur', () => {
    expect(deltaView(0)).toEqual({ text: 'değişmedi', tone: 'neutral' });
  });

  it('ölçüm yoksa rozet YOKTUR', () => {
    expect(deltaView(null)).toBeNull();
  });
});

describe('toFunnel', () => {
  it('adımları sırayla, oran ve kaybıyla üretir', () => {
    const rows = [
      row({ type: 'page_view', eventCount: 100 }),
      row({ type: 'product_view', eventCount: 60 }),
      row({ type: 'add_to_cart', eventCount: 30 }),
      row({ type: 'checkout_start', eventCount: 12 }),
      row({ type: 'order_placed', eventCount: 9 }),
    ];
    const steps = toFunnel(rows);
    expect(steps.map((s) => s.count)).toEqual([100, 60, 30, 12, 9]);
    expect(steps[0]!.drop).toBeNull();
    expect(steps[3]!.drop).toBeCloseTo(0.6);
  });

  it('en büyük sızıntıyı TEK adımda işaretler', () => {
    const rows = [
      row({ type: 'page_view', eventCount: 100 }),
      row({ type: 'product_view', eventCount: 90 }),
      row({ type: 'add_to_cart', eventCount: 20 }),
      row({ type: 'checkout_start', eventCount: 18 }),
      row({ type: 'order_placed', eventCount: 17 }),
    ];
    expect(toFunnel(rows).filter((s) => s.worst).map((s) => s.label)).toEqual(['Sepete ekleme']);
  });

  it('hiç veri yokken HİÇBİR adım "en büyük sızıntı" değildir', () => {
    // Hepsi sıfırken bir adımı kırmızıya boyamak, olmayan bir arızayı işaret etmek olurdu.
    expect(toFunnel([]).some((s) => s.worst)).toBe(false);
  });
});

describe('toHeat', () => {
  it('saat dizilerini haftanın gününe toplar', () => {
    const hourly = new Array(24).fill(0);
    hourly[18] = 5;
    // 2026-08-01 Cumartesi, 2026-08-03 Pazartesi.
    const rows = [row({ day: '2026-08-01', hourly }), row({ day: '2026-08-03', hourly })];
    const heat = toHeat(rows, ['page_view']);
    expect(heat.map((r) => r.day)).toEqual(['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']);
    expect(heat[0]!.hours[18]).toBe(5);
    expect(heat[5]!.hours[18]).toBe(5);
    expect(heat[1]!.hours[18]).toBe(0);
  });

  it('istenmeyen olay tipini saymaz', () => {
    const hourly = new Array(24).fill(0);
    hourly[9] = 3;
    expect(toHeat([row({ type: 'search', hourly })], ['page_view'])[0]!.hours[9]).toBe(0);
  });
});

describe('toSeries', () => {
  it('iki pencereyi TARİHE göre değil SIRAYA göre eşler', () => {
    // Kıyasın sorusu "aynı uzunlukta bir önceki pencerede kaçtı" — takvimde aynı gün değil.
    const cur = [row({ day: '2026-08-01', eventCount: 10 }), row({ day: '2026-08-02', eventCount: 20 })];
    const prev = [row({ day: '2026-07-30', eventCount: 4 }), row({ day: '2026-07-31', eventCount: 6 })];
    expect(toSeries(cur, prev, ['page_view'])).toEqual([
      { day: '2026-08-01', value: 10, prev: 4 },
      { day: '2026-08-02', value: 20, prev: 6 },
    ]);
  });

  it('önceki pencere kısaysa eşi olmayan gün `null` kalır — sıfır DEĞİL', () => {
    const cur = [row({ day: '2026-08-01', eventCount: 10 }), row({ day: '2026-08-02', eventCount: 20 })];
    expect(toSeries(cur, [row({ day: '2026-07-31', eventCount: 4 })], ['page_view'])[1]!.prev).toBeNull();
  });

  it('aynı günün birden çok boyut satırını toplar', () => {
    const rows = [
      row({ day: '2026-08-01', channel: 'b2c', eventCount: 7 }),
      row({ day: '2026-08-01', channel: 'b2b', eventCount: 3 }),
    ];
    expect(toSeries(rows, [], ['page_view'])[0]!.value).toBe(10);
  });
});

// `toCampaignRows` testleri SİLİNDİ: işlev 13.2 inince kapıya taşındı (`readCampaignRoi`) ve
// kuralları orada sınanıyor. Ekranda kalan bir kopyayı test etmek, artık kimsenin çağırmadığı bir
// birleştirmeyi yeşil tutmak olurdu.

describe('toFunnel — adımlar iç içe kümeler DEĞİL', () => {
  it('bir adım öncekinden BÜYÜKSE çubuk taşmaz ve kayıp negatif kalır', () => {
    // Gerçek veride yaşandı: tek ziyaret sayfada birden çok ürün kartı görüyor, yani
    // `product_view` `page_view`'dan büyük çıkabiliyor. Kırpmasaydık çubuk kutudan taşardı;
    // işareti ekrana bırakmasaydık "−%-300" yazardı.
    const steps = toFunnel([row({ type: 'page_view', eventCount: 1 }), row({ type: 'product_view', eventCount: 4 })]);
    expect(steps[1]!.share).toBe(1);
    expect(steps[1]!.drop).toBeLessThan(0);
    expect(steps[1]!.worst).toBe(false);
  });
});
