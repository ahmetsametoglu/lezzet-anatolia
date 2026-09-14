import { describe, expect, it } from 'vitest';
import { CAPITAL_NATURE } from '@lezzet/types';
import { typePatch, type NatureOption } from './schema';

/**
 * Hareket türü değişince yön ve tür (12.24) — Para penceresinin dört kipli seçicisi ile asistan
 * kuyruğundaki gövdenin kendi seçicisi aynı kuralı okuyor; kural burada bir kez sınanır.
 */
const natures: NatureOption[] = [
  { value: 'kira', label: 'Kira', direction: 'out' },
  { value: CAPITAL_NATURE, label: 'Sermaye', direction: 'in' },
  { value: 'faiz', label: 'Faiz geliri', direction: 'in' },
];

describe('typePatch', () => {
  it('gider çıkıştır; hâlâ uyan tür yerinde kalır', () => {
    expect(typePatch(natures, { direction: 'in', nature: 'kira' }, 'expense')).toEqual({ type: 'expense', direction: 'out', nature: 'kira' });
  });

  it('sermaye giriştir; tek doğru türü kendiliğinden konur', () => {
    expect(typePatch(natures, { direction: 'out', nature: 'kira' }, 'capital')).toEqual({ type: 'capital', direction: 'in', nature: CAPITAL_NATURE });
  });

  it('sınıflandırılmamış hareket yönü korur; uymayan tür boşalır, uyan giriş türü kalır', () => {
    expect(typePatch(natures, { direction: 'out', nature: 'kira' }, 'misc')).toEqual({ type: 'misc', direction: 'out', nature: '' });
    expect(typePatch(natures, { direction: 'in', nature: 'faiz' }, 'misc')).toEqual({ type: 'misc', direction: 'in', nature: 'faiz' });
  });
});
