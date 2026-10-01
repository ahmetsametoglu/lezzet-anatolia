import { describe, expect, it } from 'vitest';
import { splitRegisterLine } from './split';

describe('kasa kalemi bölme', () => {
  it('kuruşa bölünmeyen birim fiyat iki kaleme ayrılır, toplam tam tutardır', () => {
    // Kasa 3 × 9,6667'yi 29,01 yazıyor; tek kalem olsaydı fiş tahsilattan bir kuruş fazla çıkardı.
    const parts = splitRegisterLine({ qty: 3, amountCents: 2900 });
    expect(parts).toEqual([
      { quantity: 2, unitPriceCents: 967 },
      { quantity: 1, unitPriceCents: 966 },
    ]);
    expect(parts.reduce((sum, p) => sum + p.quantity * p.unitPriceCents, 0)).toBe(2900);
  });

  it('tam bölünen kalem tek parçadır', () => {
    // Sıfır adetli ikinci parça kasaya boş kalem olarak giderdi.
    expect(splitRegisterLine({ qty: 2, amountCents: 2000 })).toEqual([{ quantity: 2, unitPriceCents: 1000 }]);
  });

  it('iade kalemi artı adet ve eksi birim fiyatla yazılır', () => {
    // Kasa eksi adeti reddediyor; adet eksi gitseydi iade fişi kapanmazdı.
    expect(splitRegisterLine({ qty: -1, amountCents: -967 })).toEqual([{ quantity: 1, unitPriceCents: -967 }]);
  });
});
