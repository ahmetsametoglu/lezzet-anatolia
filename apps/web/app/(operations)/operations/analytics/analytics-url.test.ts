import { describe, expect, it } from 'vitest';
import { analyticsUrl, parseAnalyticsUrl, periodRange } from './analytics-url';

/**
 * URL sözleşmesi saf mantıktır (DB yok) → birim test. Bu ekranda önemi ayrıca büyük: mod/dönem/kanal
 * SUNUCUDA okunuyor ve analitikte bir bulguyu göstermenin tek yolu bağlantı paylaşmak. Adres yanlış
 * ayrıştırılırsa hata vermez — karşı taraf başka bir döneme bakar ve iki kişi aynı ekranda farklı
 * sayı görür.
 */

describe('parseAnalyticsUrl', () => {
  it('boş parametrelerde varsayılana düşer', () => {
    expect(parseAnalyticsUrl({})).toEqual({ mode: 'ticaret', period: 'd30', channel: 'all' });
  });

  it('tanınmayan değerleri sessizce varsayılana çevirir (bozuk link ekranı kırmaz)', () => {
    expect(parseAnalyticsUrl({ mode: 'kar', period: 'd365', ch: 'b2g' })).toEqual({
      mode: 'ticaret',
      period: 'd30',
      channel: 'all',
    });
  });

  it('kanal parametresi adreste `ch` adıyla taşınır', () => {
    expect(parseAnalyticsUrl({ ch: 'b2b' }).channel).toBe('b2b');
  });
});

describe('analyticsUrl', () => {
  it('varsayılan durumda parametre YAZMAZ (temiz adres)', () => {
    expect(analyticsUrl(parseAnalyticsUrl({}))).toBe('/operations/analytics');
  });

  it('gidiş-dönüş kayıpsız', () => {
    const url = analyticsUrl({ mode: 'trafik', period: 'd90', channel: 'b2c' });
    const params = Object.fromEntries(new URLSearchParams(url.split('?')[1]));
    expect(parseAnalyticsUrl(params)).toEqual({ mode: 'trafik', period: 'd90', channel: 'b2c' });
  });
});

describe('periodRange', () => {
  const now = new Date('2026-08-04T12:00:00.000Z');

  it('önceki pencere AYNI uzunlukta ve hemen öncesindedir', () => {
    const r = periodRange('d30', now);
    const len = (a: string, b: string) => Date.parse(b) - Date.parse(a);
    expect(len(r.from, r.to)).toBe(len(r.prevFrom, r.prevTo));
    // İki pencere birbirine DEĞER: öncekinin sonu, bu dönemin başı. Arada boşluk kalsaydı o günler
    // hiçbir kıyasa girmez ve fark hiçbir yerde görünmezdi.
    expect(r.prevTo).toBe(r.from);
  });

  it('dönem uzunluğu seçime göre değişir', () => {
    const day = 86_400_000;
    const span = (p: 'd7' | 'd30' | 'd90') => {
      const r = periodRange(p, now);
      return (Date.parse(r.to) - Date.parse(r.from)) / day;
    };
    expect(span('d7')).toBe(7);
    expect(span('d30')).toBe(30);
    expect(span('d90')).toBe(90);
  });
});
