import { describe, expect, it } from 'vitest';
import type { StockWarehouseSplit } from '@/lib/stock/level-rows';
import { stockParts } from './variant-cells';

// Kırılımın stok hücresi tek toplam yazar, depo dağılımı ipucundadır; ipucu toplamı tekrar etseydi dağılım kaybolurdu.

const split = (code: string, availableQty: number): StockWarehouseSplit => ({
  warehouseId: code,
  code,
  name: code,
  physicalQty: availableQty,
  reservedQty: 0,
  availableQty,
  nearestExpiry: null,
});

describe('stockParts', () => {
  it('hücre toplamı ve depo sayısını, ipucu her deponun kendi adedini yazar', () => {
    expect(stockParts(40, [split('STR', 31), split('BDX', 9)])).toEqual({ total: 40, note: '2 depo', hint: 'STR · 31\nBDX · 9' });
  });

  it('malı olmayan boyda "stok yok" der ve ipucu çizilmez', () => {
    expect(stockParts(0, [])).toEqual({ total: 0, note: 'stok yok', hint: null });
  });
});
