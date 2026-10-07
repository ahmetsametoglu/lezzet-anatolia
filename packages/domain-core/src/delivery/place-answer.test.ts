import { describe, expect, it } from 'vitest';
import { placeAnswerNote } from './place-answer';

describe('placeAnswerNote', () => {
  it('rota dışında çözülen yer kargo cümlesini alır, kapıya teslim sözünü değil', () => {
    expect(placeAnswerNote({ kind: 'resolved', place: { inRoute: false } })).toBe('shipping');
    expect(placeAnswerNote({ kind: 'resolved', place: { inRoute: true } })).toBe('inside');
  });

  it('depo eksiğimiz müşteriye bölge dışı diye söylenmez', () => {
    expect(placeAnswerNote({ kind: 'unresolved', reason: 'no_shipping_warehouse' })).toBe('unresolved');
    expect(placeAnswerNote({ kind: 'unresolved', reason: 'outside_zones' })).toBe('outside');
  });
});
