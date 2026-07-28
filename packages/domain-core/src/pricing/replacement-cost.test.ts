import { describe, expect, it } from 'vitest';
import { COST_OUTLIER_PERCENT, costOf, replacementCost } from './replacement-cost';

/**
 * Maliyet tabanı kararı. Buradaki hatalar sessizdir: yanlış taban, ekranda doğru görünen ama
 * hedefini tutturmayan bir fiyat üretir.
 */

describe('taban son alıştır', () => {
  it('en yeni alış tabandır — depodaki eski ucuz parti fiyatı aşağı çekmez', () => {
    // Ağırlıklı ortalama burada ~430 derdi (eski partiler hâlâ elde); taban 450, çünkü yeniden
    // almanın bedeli budur.
    expect(replacementCost([450, 430, 420])).toEqual({ status: 'ok', costCents: 450 });
  });

  it('YEREL VERİDEKİ gerçek sıçrama freni tetikler (2,10 € → 4,50 €)', () => {
    // Seed'de en oynak varyantların hâli. Otomatik fiyat burada SESSİZCE iki katına çıkmaz.
    expect(replacementCost([450, 210, 210]).status).toBe('outlier');
  });

  it('tek alımda geçmiş yoktur; bu sapma değil, bilgisizliktir', () => {
    expect(replacementCost([300])).toEqual({ status: 'ok', costCents: 300 });
  });

  it('hiç alış yoksa maliyet BİLİNMİYOR — sıfır değil', () => {
    expect(replacementCost([])).toEqual({ status: 'unknown' });
    expect(costOf(replacementCost([]))).toBeNull();
    // Fiyatı girilmemiş (0/negatif) alım hesaba katılmaz.
    expect(replacementCost([0, -5])).toEqual({ status: 'unknown' });
  });
});

describe('aykırı freni', () => {
  it('eşiği aşan sıçrama otomatiği DURDURUR ama tutarı gizlemez', () => {
    // Geçmiş 200 kuruşta oturmuş, son alış 300 → %50 sapma.
    const basis = replacementCost([300, 200, 200, 210, 190]);
    expect(basis.status).toBe('outlier');
    expect(costOf(basis)).toBe(300);
    if (basis.status === 'outlier') {
      expect(basis.medianCents).toBe(200);
      expect(Math.round(basis.deviationPercent)).toBe(50);
    }
  });

  it('düşüş de aykırı olabilir — yarı fiyata alım da sorgulanır', () => {
    expect(replacementCost([100, 200, 200, 210]).status).toBe('outlier');
  });

  it('eşiğin altındaki dalgalanma normaldir', () => {
    // 240 vs medyan 200 → %20, eşik %25.
    expect(replacementCost([240, 200, 200, 210])).toEqual({ status: 'ok', costCents: 240 });
  });

  it('eşik TAM sınırda geçmez — sınır dahil normaldir', () => {
    expect(replacementCost([250, 200, 200]).status).toBe('ok'); // %25
    expect(replacementCost([251, 200, 200]).status).toBe('outlier');
    expect(COST_OUTLIER_PERCENT).toBe(25);
  });

  it('eşik parametriktir', () => {
    expect(replacementCost([240, 200, 200], { outlierPercent: 10 }).status).toBe('outlier');
  });
});

describe('medyan aykırıdan ETKİLENMEZ', () => {
  it('geçmişteki tek bir uç değer tabanı sarsmaz', () => {
    // Geçmiş: 200, 205, 195, 900 (bir kereye mahsus acil alım). Ortalama 375 olurdu ve son alış
    // 210 "aykırı" görünürdü; medyan 202 der, sonuç normaldir.
    expect(replacementCost([210, 200, 205, 195, 900]).status).toBe('ok');
  });

  it('karşılaştırma penceresi sınırlıdır — çok eski alımlar karara girmez', () => {
    // historySize 2 → yalnız 200 ve 205 bakılır.
    expect(replacementCost([210, 200, 205, 900, 900], { historySize: 2 }).status).toBe('ok');
  });
});
