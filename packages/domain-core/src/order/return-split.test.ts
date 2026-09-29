import { describe, expect, it } from 'vitest';
import { keptQtyAfter, returnAdjustments } from './return-split';

const ITEM = '11111111-1111-4111-8111-111111111111';

describe('returnAdjustments', () => {
  it('aynı kalemin payları sıralı hedef üretir, ikinci pay birincinin bıraktığından düşer', () => {
    expect(
      returnAdjustments(ITEM, 3, [
        { disposition: 'restock', qty: 1, note: 'ambalaj sağlam' },
        { disposition: 'discard', qty: 2 },
      ]),
    ).toEqual([
      { orderItemId: ITEM, fulfilledQty: 2, returnDisposition: 'restock', note: 'ambalaj sağlam' },
      { orderItemId: ITEM, fulfilledQty: 0, returnDisposition: 'discard', note: null },
    ]);
  });

  it('jest adedi düşürmez ve kaç adedin jestle kapandığını taşır', () => {
    expect(
      returnAdjustments(ITEM, 2, [
        { disposition: 'goodwill', qty: 1 },
        { disposition: 'discard', qty: 1 },
      ]),
    ).toEqual([
      { orderItemId: ITEM, fulfilledQty: 2, returnDisposition: 'goodwill', goodwillQty: 1, note: null },
      { orderItemId: ITEM, fulfilledQty: 1, returnDisposition: 'discard', note: null },
    ]);
  });

  it('toplam karşılanan adedi aşarsa, pay yoksa ya da pay kesirliyse düzeltme kurulmaz', () => {
    expect(returnAdjustments(ITEM, 1, [{ disposition: 'restock', qty: 1 }, { disposition: 'discard', qty: 1 }])).toBeNull();
    expect(returnAdjustments(ITEM, 2, [{ disposition: 'restock', qty: 0 }])).toBeNull();
    expect(returnAdjustments(ITEM, 2, [{ disposition: 'restock', qty: 1.5 }])).toBeNull();
  });
});

describe('keptQtyAfter', () => {
  it('müşteride kalan adet jest payını düşmez', () => {
    expect(keptQtyAfter(3, [{ disposition: 'goodwill', qty: 1 }, { disposition: 'restock', qty: 1 }])).toBe(2);
  });
});
