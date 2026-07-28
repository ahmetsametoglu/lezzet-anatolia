import { describe, expect, it } from 'vitest';
import { bundleBalance, rebalanceAllocations } from './bundle-allocation';

// Paket mutabakatı — saf hesap. Asıl sınanan şey "tutturulamayan hedef"in DOĞRU BİLDİRİLMESİ:
// sessizce yuvarlayan bir dağıtım, faturayı bir kuruş kaydırıp izini kaybettirirdi.

describe('bundleBalance', () => {
  it('Σ(atanmış × adet) hedefe eşitse tutuyor', () => {
    const b = bundleBalance([{ qty: 2, allocatedUnitPriceCents: 1000 }, { qty: 1, allocatedUnitPriceCents: 2990 }], 4990);
    expect(b.allocatedTotalCents).toBe(4990);
    expect(b.diffCents).toBe(0);
    expect(b.balanced).toBe(true);
  });

  it('fark işaretli döner: pozitif = fazla atanmış', () => {
    const b = bundleBalance([{ qty: 1, allocatedUnitPriceCents: 5200 }], 4990);
    expect(b.diffCents).toBe(210);
    expect(b.balanced).toBe(false);
  });

  it('hediye kalem (0) toplama katkı vermez ama satır sayılır', () => {
    const b = bundleBalance([{ qty: 1, allocatedUnitPriceCents: 4990 }, { qty: 1, allocatedUnitPriceCents: 0 }], 4990);
    expect(b.balanced).toBe(true);
  });
});

describe('rebalanceAllocations', () => {
  it('tutuyorsa fiyatlara dokunmaz', () => {
    const lines = [{ qty: 1, allocatedUnitPriceCents: 2000 }, { qty: 1, allocatedUnitPriceCents: 2990 }];
    const r = rebalanceAllocations(lines, 4990);
    expect(r.unitPricesCents).toEqual([2000, 2990]);
    expect(r.residualCents).toBe(0);
  });

  it('farkı ORANSAL dağıtır — pahalı kalem çoğunu taşır', () => {
    // 60,00 atanmış → hedef 50,00; 10,00 € düşecek. Kalemler 40,00 ve 20,00 → 2/3 ve 1/3.
    const lines = [{ qty: 1, allocatedUnitPriceCents: 4000 }, { qty: 1, allocatedUnitPriceCents: 2000 }];
    const r = rebalanceAllocations(lines, 5000);
    expect(r.achievedTotalCents).toBe(5000);
    expect(r.residualCents).toBe(0);
    expect(r.unitPricesCents[0]).toBeLessThan(4000);
    expect(r.unitPricesCents[0]! - 3333).toBeLessThanOrEqual(1);
  });

  it('adedi 1 olan kalem kalanı TAM emer → mutabakat kesinleşir', () => {
    // Adetler 3 ve 1: 3'lük kalemde birim başına tam bölünmeyen kuruş 1'lik kaleme kayar.
    const lines = [{ qty: 3, allocatedUnitPriceCents: 1000 }, { qty: 1, allocatedUnitPriceCents: 1000 }];
    const r = rebalanceAllocations(lines, 4137);
    expect(r.achievedTotalCents).toBe(4137);
    expect(r.residualCents).toBe(0);
  });

  it('adetler hedefi tutturamıyorsa KALAN bildirilir — sessizce yuvarlanmaz', () => {
    // İki kalem, adetler 2 ve 4 → ulaşılabilen her toplam ÇİFT kuruş. Tek kuruşlu hedef tutmaz.
    const lines = [{ qty: 2, allocatedUnitPriceCents: 1000 }, { qty: 4, allocatedUnitPriceCents: 1000 }];
    const r = rebalanceAllocations(lines, 5001);
    expect(r.residualCents).not.toBe(0);
    expect(Math.abs(r.residualCents)).toBeLessThanOrEqual(6); // en fazla bir "adet adımı" kadar
    expect(r.achievedTotalCents).toBe(r.residualCents + 5001);
  });

  it('hiçbir birim fiyat 0 altına inmez', () => {
    const lines = [{ qty: 1, allocatedUnitPriceCents: 500 }, { qty: 1, allocatedUnitPriceCents: 500 }];
    const r = rebalanceAllocations(lines, 100);
    expect(r.unitPricesCents.every((c) => c >= 0)).toBe(true);
  });

  it('fiyatların hepsi 0 ise adede göre dağıtır (yeni paket hâli)', () => {
    const lines = [{ qty: 1, allocatedUnitPriceCents: 0 }, { qty: 1, allocatedUnitPriceCents: 0 }];
    const r = rebalanceAllocations(lines, 5000);
    expect(r.achievedTotalCents).toBe(5000);
    expect(r.unitPricesCents).toEqual([2500, 2500]);
  });

  it('kalem yoksa hedefin tamamı kalan olarak bildirilir', () => {
    const r = rebalanceAllocations([], 4990);
    expect(r.unitPricesCents).toEqual([]);
    expect(r.residualCents).toBe(-4990);
  });

  // Paket formunun kullandığı kip: AĞIRLIK = liste fiyatı. Girdi olarak liste fiyatlarını verince
  // "hedefi liste oranında böl" demek oluyor — ayrı bir dağıtım fonksiyonu yazmaya gerek yok.
  describe('liste fiyatı ağırlığıyla dağıtım (paket formunun kipi)', () => {
    it('indirim yoksa paylar liste fiyatının AYNISI kalır', () => {
      const liste = [{ qty: 1, allocatedUnitPriceCents: 2850 }, { qty: 1, allocatedUnitPriceCents: 1240 }, { qty: 1, allocatedUnitPriceCents: 900 }];
      const r = rebalanceAllocations(liste, 4990); // Σ liste = 49,90
      expect(r.unitPricesCents).toEqual([2850, 1240, 900]);
      expect(r.residualCents).toBe(0);
    });

    it('indirim ORANSAL iner: pahalı kalem indirimin çoğunu taşır, toplam tam tutar', () => {
      const liste = [{ qty: 1, allocatedUnitPriceCents: 3000 }, { qty: 1, allocatedUnitPriceCents: 1000 }];
      const r = rebalanceAllocations(liste, 3600); // 40,00 → 36,00 (%10 indirim)
      expect(r.achievedTotalCents).toBe(3600);
      expect(r.residualCents).toBe(0);
      // Pahalı kalem 300, ucuz kalem 100 kuruş düşer (10'a 1 oranı korunur).
      expect(r.unitPricesCents).toEqual([2700, 900]);
    });

    it('adet çarpanı ağırlığa girer: 2 adetlik kalem indirimin iki katını taşır', () => {
      const liste = [{ qty: 2, allocatedUnitPriceCents: 1000 }, { qty: 1, allocatedUnitPriceCents: 1000 }];
      const r = rebalanceAllocations(liste, 2700); // 30,00 → 27,00
      expect(r.achievedTotalCents).toBe(2700);
      // 2×1000 satırı 200, 1×1000 satırı 100 düşer → birim fiyatlar 900 ve 900.
      expect(r.unitPricesCents).toEqual([900, 900]);
    });

    it('hediye kalem (liste ağırlığı 0) dağıtımda 0 KALIR', () => {
      const liste = [{ qty: 1, allocatedUnitPriceCents: 2000 }, { qty: 1, allocatedUnitPriceCents: 0 }];
      const r = rebalanceAllocations(liste, 1800);
      expect(r.unitPricesCents).toEqual([1800, 0]);
      expect(r.residualCents).toBe(0);
    });
  });
});
