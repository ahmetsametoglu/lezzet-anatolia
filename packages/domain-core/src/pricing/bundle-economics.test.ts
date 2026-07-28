import { describe, expect, it } from 'vitest';
import { bundleEconomics } from './bundle-economics';
import { isBelowTargetMargin, markupPercent, priceForMargin } from './margin';

// Paketin parası. Buradaki sayılar operatörün fiyat kararını doğrudan besliyor: yanlışsa paket
// zararına satılır ve kimse fark etmez.

describe('markupPercent (DOMAIN tanımı: maliyet üzerine markup)', () => {
  it('maliyet 10 €, fiyat 14 € → %40', () => {
    expect(markupPercent(1400, 1000)).toBeCloseTo(40, 6);
  });

  it('brüt marj ile KARIŞTIRILMAZ — aynı sayılar kâr/satış hesabında %28,6 verirdi', () => {
    const markup = markupPercent(1400, 1000)!;
    expect(markup).not.toBeCloseTo((400 / 1400) * 100, 1);
  });

  it('maliyetin altında satış negatif marj verir', () => {
    expect(markupPercent(800, 1000)).toBeCloseTo(-20, 6);
  });

  it('maliyet 0 ise karar yok (bölünemez)', () => {
    expect(markupPercent(1400, 0)).toBeNull();
  });
});

describe('priceForMargin / isBelowTargetMargin', () => {
  it('hedef marjın eşiği: maliyet 10 €, hedef %40 → 14 €', () => {
    expect(priceForMargin(1000, 40)).toBe(1400);
  });

  it('eşiğin altı uyarır, eşik ve üstü uyarmaz', () => {
    expect(isBelowTargetMargin(1399, 1000, 40)).toBe(true);
    expect(isBelowTargetMargin(1400, 1000, 40)).toBe(false);
    expect(isBelowTargetMargin(1500, 1000, 40)).toBe(false);
  });

  it('maliyet ya da hedef bilinmiyorsa KARAR YOKTUR — uyarı da çıkmaz', () => {
    expect(isBelowTargetMargin(1400, null, 40)).toBeNull();
    expect(isBelowTargetMargin(1400, 1000, null)).toBeNull();
  });
});

describe('bundleEconomics', () => {
  // Tatlı %5,5 + malzeme %20 — paketin tek KDV oranı YOKTUR, asıl sınanan bu.
  const lines = [
    { qty: 1, allocatedUnitPriceCents: 2850, vatRate: 5.5, unitCostCents: 1600 },
    { qty: 2, allocatedUnitPriceCents: 1000, vatRate: 20, unitCostCents: 600 },
  ];

  it('HT satış kalem kalem indirilir — paket toplamına tek oran uygulanmaz', () => {
    const e = bundleEconomics(lines);
    expect(e.revenueTtcCents).toBe(4850);
    // 2850/1,055 = 2701 · 1000/1,20 = 833 (×2)
    expect(e.revenueHtCents).toBe(2701 + 833 * 2);
    // Paketin tamamına %5,5 uygulansaydı HT 4597 çıkardı — 30 kuruşluk sessiz sapma.
    expect(e.revenueHtCents).not.toBe(Math.round(4850 / 1.055));
  });

  it('maliyet adetle çarpılır, kâr ve marj HT üstünden hesaplanır', () => {
    const e = bundleEconomics(lines);
    expect(e.costCents).toBe(1600 + 600 * 2);
    expect(e.profitCents).toBe(e.revenueHtCents - 2800);
    expect(e.marginPercent).toBeCloseTo(((e.revenueHtCents - 2800) / 2800) * 100, 6);
  });

  it('KDV payı satışın içinden çıkar (TTC − HT)', () => {
    const e = bundleEconomics(lines);
    expect(e.vatCents).toBe(e.revenueTtcCents - e.revenueHtCents);
  });

  it('bir kalemin maliyeti bilinmiyorsa maliyet ve marj YAZILMAZ', () => {
    const e = bundleEconomics([lines[0]!, { ...lines[1]!, unitCostCents: null }]);
    expect(e.unknownCostLines).toBe(1);
    expect(e.costCents).toBeNull();
    expect(e.marginPercent).toBeNull();
    // Satış tarafı yine hesaplanır: bilinen bilinmeyene kurban edilmez.
    expect(e.revenueTtcCents).toBe(4850);
  });

  it('kalemsiz pakette marj yoktur (bölünecek bir şey yok)', () => {
    const e = bundleEconomics([]);
    expect(e.revenueTtcCents).toBe(0);
    expect(e.costCents).toBeNull();
    expect(e.marginPercent).toBeNull();
  });

  it('hediye kalem maliyeti taşır ama gelir getirmez — marjı DÜŞÜRÜR', () => {
    const withGift = bundleEconomics([...lines, { qty: 1, allocatedUnitPriceCents: 0, vatRate: 5.5, unitCostCents: 500 }]);
    const without = bundleEconomics(lines);
    expect(withGift.revenueHtCents).toBe(without.revenueHtCents);
    expect(withGift.costCents).toBe(without.costCents! + 500);
    expect(withGift.marginPercent!).toBeLessThan(without.marginPercent!);
  });
});
