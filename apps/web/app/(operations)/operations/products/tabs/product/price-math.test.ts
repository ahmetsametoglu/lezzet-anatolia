import { describe, expect, it } from 'vitest';
import { marginForAmount } from './price-math';

// Satır içi düzenlemede kutuya yazılan tutarın marjı. Hata SESSİZDİR: KDV düşülmezse marj oran
// kadar şişer ve operatör zararına bir fiyatı kârlı sanarak kaydeder — bu yüzden testi var.

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
