import { describe, expect, it } from 'vitest';
import { boxCompletion } from './box-completion';

describe('boxCompletion', () => {
  it('her kalem tamamen kutulandıysa sipariş kapanabilir', () => {
    const result = boxCompletion([
      { itemId: 'a', orderedQty: 3, boxedQty: 3 },
      { itemId: 'b', orderedQty: 1, boxedQty: 1 },
    ]);
    expect(result).toEqual({ complete: true, missing: [] });
  });

  it('eksik kalan kalemleri adetleriyle söyler — döngü "yeni kutu mu" sorusunu bununla cevaplar', () => {
    const result = boxCompletion([
      { itemId: 'a', orderedQty: 5, boxedQty: 2 },
      { itemId: 'b', orderedQty: 2, boxedQty: 2 },
      { itemId: 'c', orderedQty: 4, boxedQty: 0 },
    ]);
    expect(result.complete).toBe(false);
    expect(result.missing).toEqual([
      { itemId: 'a', missingQty: 3 },
      { itemId: 'c', missingQty: 4 },
    ]);
  });

  it('kalemsiz girdi "tamam" sayılır — boş sipariş bu motora hiç gelmez, gelirse döngüyü kilitlemez', () => {
    expect(boxCompletion([])).toEqual({ complete: true, missing: [] });
  });

  it('fazla kutulama eksik üretmez (savunma — doğamaz: Σ kutu = karşılanan denetimi RPC/de)', () => {
    const result = boxCompletion([{ itemId: 'a', orderedQty: 2, boxedQty: 3 }]);
    expect(result).toEqual({ complete: true, missing: [] });
  });
});
