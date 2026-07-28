import { describe, expect, it } from 'vitest';
import { isBelowTargetMargin, markupPercent, priceForMargin, tightestMargin } from './margin';

/**
 * Marj tanımı ve çok kanallı marj-altı ölçütü (09.5). Tanımın kendisi DOMAIN'de tektir: maliyet
 * ÜZERİNE markup. Bu testler o tanımın kaymamasını ve iki kanallı satırda hangi sayının
 * gösterildiğini sabitler.
 */

describe('markup tanımı', () => {
  it('maliyet 10 €, fiyat 14 € → %40 (brüt marj tanımıyla %28,6 olurdu)', () => {
    expect(markupPercent(1400, 1000)).toBeCloseTo(40, 5);
  });

  it('hedef marjdan fiyat, fiyattan marj — kapalı devre', () => {
    expect(markupPercent(priceForMargin(1000, 42), 1000)).toBeCloseTo(42, 5);
  });

  it('maliyet bilinmiyorsa marj yoktur — sıfır sayılmaz', () => {
    expect(markupPercent(1400, 0)).toBeNull();
  });
});

describe('en dar marj (iki kanallı satırın tek sayısı)', () => {
  const cost = 1000;

  it('kârlı kanal, zarardaki kanalı GİZLEMEZ — küçük olan gösterilir', () => {
    const result = tightestMargin(
      [
        { channel: 'b2c', revenueHtCents: 1700 }, // %70
        { channel: 'b2b', revenueHtCents: 900 }, // −%10
      ],
      cost,
    );
    expect(result).toEqual({ channel: 'b2b', percent: -10 });
  });

  it('fiyatı olmayan kanal hesaba girmez — satışa kapalı olmak sıfır marj değildir', () => {
    const result = tightestMargin([{ channel: 'b2c', revenueHtCents: 1500 }], cost);
    expect(result).toEqual({ channel: 'b2c', percent: 50 });
  });

  it('hiç fiyat yoksa karar yoktur', () => {
    expect(tightestMargin([], cost)).toBeNull();
  });

  it('maliyet bilinmiyorsa karar yoktur — fiyat bilinse bile', () => {
    expect(tightestMargin([{ channel: 'b2c', revenueHtCents: 1500 }], null)).toBeNull();
  });
});

describe('marj-altı uyarısı', () => {
  it('hedefin altındaki fiyat yakalanır', () => {
    expect(isBelowTargetMargin(1300, 1000, 40)).toBe(true);
  });

  it('hedefi tam sağlayan fiyat altında SAYILMAZ — eşik dahildir', () => {
    expect(isBelowTargetMargin(1400, 1000, 40)).toBe(false);
  });

  it('hedef yazılmamışsa uyarı da yoktur — uydurulmuş bir hedefe göre alarm verilmez', () => {
    expect(isBelowTargetMargin(1300, 1000, null)).toBeNull();
  });
});
