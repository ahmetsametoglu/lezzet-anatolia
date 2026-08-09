import { describe, expect, it } from 'vitest';
import { removeVat } from '@lezzet/helper';
import { bundleEconomics, markupPercent } from '@lezzet/domain-core';

/**
 * Kâr künyesinin ARİTMETİĞİ (22.7) — `economics.ts`in DB'siz çekirdeği.
 *
 * Buradaki testler veriye değil **iki karara** bakıyor, çünkü ikisi de sessizce yanlış cevap
 * verebilecek cinsten:
 *
 * ① KDV tabanı — satış fiyatı KDV DAHİL, maliyet HARİÇ. Doğrudan çıkarmak marjı KDV oranı kadar
 *    şişirir ve zararı kâr gibi gösterebilir.
 * ② Bilinmeyen maliyet — `null` kalmalı, sıfıra düşmemeli. Sıfır maliyet **"%100 kâr"** gösterir
 *    ve bu en tehlikeli yanlıştır: ikna edicidir.
 *
 * DB'ye vuran yol (`economicsOf`) entegrasyon tarafında; burası saf hesap.
 */

describe('KDV tabanı', () => {
  it('satış KDV DAHİL, maliyet HARİÇ — çıkarmadan önce aynı tabana getirilir', () => {
    // 5,90 € paket · %5,5 KDV → HT ≈ 5,59 €. Maliyet 6,10 € (zaten HT).
    const priceHt = removeVat(590, 5.5);
    const cost = 610;

    expect(priceHt).toBeLessThan(590);
    // Zarar: HT fiyat maliyetin ALTINDA. Ham (KDV dahil) karşılaştırma da zarar derdi ama
    // küçültürdü — asıl tehlike ters yönde: dar kârı kâr sanmak.
    expect(priceHt - cost).toBeLessThan(0);
    expect(markupPercent(priceHt, cost)!).toBeLessThan(0);
  });

  it('KDV atlanırsa marj ŞİŞER — aynı veriyle on kat fark', () => {
    const price = 1000; // KDV dahil
    const cost = 900; // KDV hariç
    const dogru = markupPercent(removeVat(price, 10), cost)!; // ≈ +1,0 %
    const yanlis = markupPercent(price, cost)!; // ≈ +11,1 %

    expect(dogru).toBeLessThan(2);
    expect(yanlis).toBeGreaterThan(10);
  });

  /** Ve sınırda işaret DEĞİŞİR: aynı veri, biri zarar diyor öteki kâr. Asıl tehlike bu. */
  it('dar marjda KDV atlamak ZARARI KÂR gösterir', () => {
    const price = 1000; // KDV dahil
    const cost = 940; // KDV hariç — HT fiyatın (909) üstünde

    expect(markupPercent(removeVat(price, 10), cost)!).toBeLessThan(0);
    expect(markupPercent(price, cost)!).toBeGreaterThan(0);
  });
});

describe('karışık KDV — hesap MOTORUN (K3-2)', () => {
  /**
   * Bu dosya bir tur paket HT'sini kalemlerin **ağırlıklı ortalama oranıyla** hesaplıyordu. Motor
   * (`bundleEconomics`) kalem kalem indiriyor ve doğru olan o: ortalama oranla bölmek karışık
   * KDV'li pakette HT'yi ve dolayısıyla marjı **sistematik olarak düşük** gösterir.
   *
   * Yön sabit (Jensen): hata her zaman aynı tarafa düşer, yani gürültü değil sapmadır.
   */
  it('kalem kalem indirim ≠ ortalama oranla indirim, ve fark hep aynı yönde', () => {
    const lines = [
      { qty: 1, allocatedUnitPriceCents: 1000, vatRate: 5.5, unitCostCents: 750 },
      { qty: 1, allocatedUnitPriceCents: 1000, vatRate: 20, unitCostCents: 750 },
    ];
    const motor = bundleEconomics(lines);

    const ttc = 2000;
    const ortalamaOran = lines.reduce((s, l) => s + l.vatRate * ((l.allocatedUnitPriceCents * l.qty) / ttc), 0);
    const eskiYontem = removeVat(ttc, ortalamaOran);

    expect(motor.revenueTtcCents).toBe(ttc);
    expect(motor.revenueHtCents).toBeGreaterThan(eskiYontem); // eski yöntem HT'yi düşük gösteriyordu
    expect(motor.marginPercent!).toBeGreaterThan(markupPercent(eskiYontem, 1500)!);
  });

  it('bir kalemin maliyeti bilinmiyorsa motor da marjı UYDURMAZ', () => {
    const motor = bundleEconomics([
      { qty: 1, allocatedUnitPriceCents: 1000, vatRate: 5.5, unitCostCents: 750 },
      { qty: 1, allocatedUnitPriceCents: 1000, vatRate: 20, unitCostCents: null },
    ]);
    expect(motor.costCents).toBeNull();
    expect(motor.marginPercent).toBeNull();
    expect(motor.unknownCostLines).toBe(1);
    // Ama ciro bilinir — eksik olan yalnız maliyet tarafı.
    expect(motor.revenueTtcCents).toBe(2000);
  });
});

describe('bilinmeyen maliyet', () => {
  it('maliyet sıfırsa marj NULL — "%100 kâr" gösterilmez', () => {
    expect(markupPercent(1000, 0)).toBeNull();
  });

  /**
   * Toplam kuralı: bir kalemin maliyeti bilinmiyorsa TOPLAM da bilinmiyor. Eksik kalemi 0 sayan
   * bir toplam, paketi olduğundan kârlı gösterirdi — mal kabuldeki `amountCentsOf` kuralının aynısı.
   */
  it('bir kalemin maliyeti eksikse paket toplamı UYDURULMAZ', () => {
    const lines: Array<{ qty: number; costCents: number | null }> = [
      { qty: 2, costCents: 300 },
      { qty: 1, costCents: null },
    ];
    const total = lines.some((l) => l.costCents === null) ? null : lines.reduce((s, l) => s + (l.costCents ?? 0) * l.qty, 0);
    expect(total).toBeNull();

    const tam = [{ qty: 2, costCents: 300 }, { qty: 1, costCents: 250 }];
    expect(tam.reduce((s, l) => s + l.costCents * l.qty, 0)).toBe(850);
  });
});
