import { describe, expect, it } from 'vitest';
import { cellMargin, marginForAmount } from './price-math';

// Kutuya yazılan tutarın marjı: KDV düşülmezse marj oran kadar şişer ve operatör zararına bir fiyatı kârlı sanarak kaydeder.

describe('marginForAmount', () => {
  it('B2C tutarından KDV düşülür — fiyat KDV DAHİL girilir', () => {
    // 21,10 € TTC · %5,5 KDV → 20,00 € HT; maliyet 10,00 € → marj %100.
    expect(marginForAmount('b2c', 21.1, { costCents: 1000, vatRate: 5.5 })).toBeCloseTo(100, 0);
  });

  it('B2B tutarı olduğu gibi alınır — fiyat KDV HARİÇ girilir', () => {
    expect(marginForAmount('b2b', 20, { costCents: 1000, vatRate: 5.5 })).toBeCloseTo(100, 0);
  });

  it('aynı rakam iki kanalda farklı marj verir (taban farkı görünür olmalı)', () => {
    const b2c = marginForAmount('b2c', 20, { costCents: 1000, vatRate: 20 });
    const b2b = marginForAmount('b2b', 20, { costCents: 1000, vatRate: 20 });
    expect(b2c).not.toBeNull();
    expect(b2b).not.toBeNull();
    expect(b2c!).toBeLessThan(b2b!);
  });

  it('maliyet bilinmiyorsa marj da bilinmiyordur — sıfır maliyet varsayılmaz', () => {
    expect(marginForAmount('b2c', 34.9, { costCents: null, vatRate: 5.5 })).toBeNull();
  });
});

// Kırılımın her fiyat hücresi kendi marjını yazar; satırın en dar marjını yazsaydı B2C'nin altında B2B'nin marjı okunurdu.
describe('cellMargin', () => {
  const cell = (amountCents: number | null) => ({ amountCents, validFrom: null });

  it('her kanal kendi tutarının marjını verir, satırın en darını değil', () => {
    // 12,40 € TTC · %20 KDV → ≈10,33 € HT; maliyet 6,10 € → B2C ≈%69. B2B 9,30 € HT → ≈%52 (satırın en darı).
    const row = { b2c: cell(1240), b2b: cell(930), costCents: 610, vatRate: 20 };
    expect(cellMargin(row, 'b2c')).toBeCloseTo(69, 0);
    expect(cellMargin(row, 'b2b')).toBeCloseTo(52, 0);
  });

  it('kanalın fiyatı yoksa o hücrenin marjı da yoktur', () => {
    expect(cellMargin({ b2c: cell(null), b2b: cell(930), costCents: 610, vatRate: 20 }, 'b2c')).toBeNull();
  });
});
