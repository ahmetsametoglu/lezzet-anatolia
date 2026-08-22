import { describe, expect, it } from 'vitest';
import { mixedLotCases } from './stock-labels';

/**
 * Parti karışma sinyali (23.9) — lot etiketi kararının SAYISAL ölçütü (etüt §1.10). En kritik
 * iddia: tükenmiş parti karışma SAYILMAZ — rafta ayrım sorunu yaratmayan bir kayıt, lot etiketi
 * gündemini şişirmemeli.
 */
const batch = (warehouseId: string, variantId: string, physicalQty: number) => ({ warehouseId, variantId, physicalQty });

describe('mixedLotCases', () => {
  it('aynı depoda aynı varyantın 2+ açık partisi TEK durum sayılır', () => {
    expect(
      mixedLotCases([batch('w1', 'v1', 5), batch('w1', 'v1', 3), batch('w1', 'v1', 2), batch('w1', 'v2', 4)]),
    ).toBe(1);
  });

  it('aynı varyantın İKİ DEPODAKİ partileri karışma değildir — ayrım depo içinde aranır', () => {
    expect(mixedLotCases([batch('w1', 'v1', 5), batch('w2', 'v1', 3)])).toBe(0);
  });

  it('tükenmiş parti açık sayılmaz — rafta ayrım sorunu yaratmaz', () => {
    expect(mixedLotCases([batch('w1', 'v1', 5), batch('w1', 'v1', 0)])).toBe(0);
  });

  it('boş küme sıfırdır — sinyal sıfırda kaldıkça lot etiketi gündeme gelmez', () => {
    expect(mixedLotCases([])).toBe(0);
  });
});
