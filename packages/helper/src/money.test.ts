import { describe, expect, it } from 'vitest';
import { addVat, distributeDiscount, fromCents, percentOf, removeVat, toCents, vatPortion } from './money';

describe('cent dönüşümü', () => {
  it('kayan nokta sapmasını yutar', () => {
    expect(toCents(16.9)).toBe(1690);
    expect(toCents(0.1) + toCents(0.2)).toBe(30); // 0.1+0.2 = 0.30000000000000004 değil
    expect(fromCents(1690)).toBe(16.9);
  });
});

describe('distributeDiscount — Σ pay = indirim (STACK §8)', () => {
  it('bölünemeyen kuruşu en büyük kaleme verir', () => {
    // 3 eşit kalem, 10 cent indirim: 3,33… → 3+3+3 = 9, artan 1 kuruş en büyüğe (ilk eşit)
    const shares = distributeDiscount([1000, 1000, 1000], 10);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(10);
    expect(shares).toEqual([4, 3, 3]);
  });

  it('farklı tutarlı kalemlerde pay orantılıdır ve toplam tutar', () => {
    const lines = [1690, 800, 510]; // toplam 3000
    const shares = distributeDiscount(lines, 450); // %15
    expect(shares.reduce((a, b) => a + b, 0)).toBe(450);
    expect(shares[0]).toBeGreaterThan(shares[1] ?? 0);
    expect(shares[1]).toBeGreaterThan(shares[2] ?? 0);
  });

  it('kuponun sepetten büyük olması sepetle sınırlanır', () => {
    const shares = distributeDiscount([500, 500], 5000);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it('boş sepet / sıfır indirim bölme yapmaz', () => {
    expect(distributeDiscount([], 100)).toEqual([]);
    expect(distributeDiscount([1000], 0)).toEqual([0]);
    expect(distributeDiscount([0, 0], 100)).toEqual([0, 0]);
  });

  it('her kalem tam olarak bir kez sayılır (kayıp/çift sayım yok)', () => {
    const lines = [333, 777, 111, 999, 1];
    const shares = distributeDiscount(lines, 271);
    expect(shares).toHaveLength(lines.length);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(271);
    expect(shares.every((s) => s >= 0)).toBe(true);
  });
});

describe('KDV', () => {
  it('ekleme ve ayırma birbirinin tersidir (yuvarlama toleransıyla)', () => {
    expect(addVat(1200, 5.5)).toBe(1266);
    expect(removeVat(1266, 5.5)).toBe(1200);
    expect(addVat(1000, 20)).toBe(1200);
    expect(removeVat(1200, 20)).toBe(1000);
  });

  it('dahil fiyatın KDV payı', () => {
    expect(vatPortion(1690, 5.5)).toBe(88); // 16,90 TTC içindeki KDV
    expect(vatPortion(1200, 20)).toBe(200);
  });

  it('%0 (reverse charge) tutarı değiştirmez', () => {
    expect(addVat(1200, 0)).toBe(1200);
    expect(removeVat(1200, 0)).toBe(1200);
    expect(vatPortion(1200, 0)).toBe(0);
  });
});

describe('percentOf', () => {
  it('aşağı yuvarlar — artan kuruş dağıtıcıya bırakılır', () => {
    expect(percentOf(1690, 15)).toBe(253); // 253,5 → 253
    expect(percentOf(1000, 10)).toBe(100);
  });
});
