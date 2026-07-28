import { describe, expect, it } from 'vitest';
import { isBelowTargetMargin, markupPercent } from './margin';
import { AUTO_PRICE_STEP_CENTS, autoPriceCents, revenueHtOf } from './auto-price';

/**
 * Otomatik fiyatın tek sözü var: yazdığı fiyat hedef marjı SAĞLAR. Testlerin çoğu bu sözü
 * yuvarlamanın ve KDV tabanının bozmadığını kanıtlar — ikisi de sessizce bir kuruş aşağı kaydırıp
 * ürünü kendi uyarısına düşürebilecek yerler.
 */

describe('kanal tabanı', () => {
  it('b2b HT saklar — hedef marj doğrudan fiyattır', () => {
    // 10 € maliyet, %40 hedef → 14 € HT; adım 5 kuruş, tam bölünüyor.
    expect(autoPriceCents({ channel: 'b2b', costCents: 1000, targetMarginPercent: 40, vatRate: 5.5 })).toBe(1400);
  });

  it('b2c TTC saklar — aynı hedefe KDV eklenir', () => {
    // 14 € HT + %5,5 = 14,77 → yukarı yuvarlama 14,80.
    expect(autoPriceCents({ channel: 'b2c', costCents: 1000, targetMarginPercent: 40, vatRate: 5.5 })).toBe(1480);
  });

  it('KDV oranı değişince b2c fiyatı değişir, b2b değişmez', () => {
    const b2c20 = autoPriceCents({ channel: 'b2c', costCents: 1000, targetMarginPercent: 40, vatRate: 20 });
    const b2b20 = autoPriceCents({ channel: 'b2b', costCents: 1000, targetMarginPercent: 40, vatRate: 20 });
    expect(b2c20).toBe(1680);
    expect(b2b20).toBe(1400);
  });
});

describe('yuvarlama hedefi ISKALAMAZ', () => {
  it('yukarı yuvarlar — aşağı yuvarlamak marjı hedefin altına düşürürdü', () => {
    // 3,33 € maliyet, %35 → 4,4955 € HT → 4,50 (4,45 hedefin altında kalırdı).
    expect(autoPriceCents({ channel: 'b2b', costCents: 333, targetMarginPercent: 35 })).toBe(450);
  });

  it('geniş bir maliyet aralığında gerçekleşen marj HEP hedefin üstünde', () => {
    for (let cost = 50; cost <= 5000; cost += 37) {
      for (const target of [20, 35, 41, 47]) {
        for (const [channel, vat] of [
          ['b2c', 5.5],
          ['b2c', 20],
          ['b2b', 5.5],
        ] as const) {
          const price = autoPriceCents({ channel, costCents: cost, targetMarginPercent: target, vatRate: vat })!;
          const achieved = markupPercent(revenueHtOf(channel, price, vat), cost)!;
          expect(achieved).toBeGreaterThanOrEqual(target);
        }
      }
    }
  });

  it('adım 1 kuruş verilirse kuruşa yuvarlar — kuruşun altı da YUKARI', () => {
    expect(autoPriceCents({ channel: 'b2b', costCents: 333, targetMarginPercent: 35, stepCents: 1 })).toBe(450);
    // 10,01 € × 1,40 = 14,014 → 14,02. `priceForMargin` burada 14,01 derdi (uyarı eşiği yuvarlar),
    // otomatik fiyat o kuruşu veremez: verirse ürün kendi hedefinin altında kalırdı.
    expect(autoPriceCents({ channel: 'b2b', costCents: 1001, targetMarginPercent: 40, stepCents: 1 })).toBe(1402);
    expect(AUTO_PRICE_STEP_CENTS).toBe(5);
  });

  it('yazdığı fiyat ekranın marj-altı uyarısını TETİKLEMEZ', () => {
    for (let cost = 61; cost <= 4000; cost += 53) {
      const price = autoPriceCents({ channel: 'b2c', costCents: cost, targetMarginPercent: 41, vatRate: 5.5 })!;
      expect(isBelowTargetMargin(revenueHtOf('b2c', price, 5.5), cost, 41)).toBe(false);
    }
  });
});

describe('maliyet yoksa karar da yok', () => {
  it('maliyet 0/negatifse null — fiyat UYDURULMAZ', () => {
    expect(autoPriceCents({ channel: 'b2c', costCents: 0, targetMarginPercent: 40, vatRate: 5.5 })).toBeNull();
    expect(autoPriceCents({ channel: 'b2b', costCents: -1, targetMarginPercent: 40, vatRate: 5.5 })).toBeNull();
  });

  it('hedef marj 0 ise fiyat maliyete eşitlenir — sıfır değil', () => {
    expect(autoPriceCents({ channel: 'b2b', costCents: 1000, targetMarginPercent: 0 })).toBe(1000);
  });
});

describe('HT dönüşümü fiyat ekranıyla AYNI', () => {
  it('b2c gidiş-dönüş: yazılan fiyattan HT geri çıkar', () => {
    expect(revenueHtOf('b2c', 1480, 5.5)).toBe(1403);
    expect(revenueHtOf('b2b', 1400, 5.5)).toBe(1400);
  });
});
