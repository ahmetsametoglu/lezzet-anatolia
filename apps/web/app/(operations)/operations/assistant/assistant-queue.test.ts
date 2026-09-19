import { describe, expect, it } from 'vitest';
import { nextProposalId, visibleRowsOf } from './assistant-queue';

/**
 * Sıra saf mantıktır (DB yok) → birim test. Önemi: karar verildikten sonra AÇILACAK öneriyi bu
 * hesap seçiyor; yanlışsa operatör kuyrukta ilerlediğini sanarken ya süzgecin dışındaki bir
 * öneriye düşer ya da az önce atladığına geri döner.
 */
const rows = [
  { id: 'a', kind: 'stock_intake' },
  { id: 'b', kind: 'zone_extend' },
  { id: 'c', kind: 'stock_intake' },
];

describe('visibleRowsOf', () => {
  it('süzgeç boşken liste olduğu gibi döner', () => {
    expect(visibleRowsOf(rows, '')).toEqual(rows);
  });

  it('süzgeç açıkken yalnız o tip kalır', () => {
    expect(visibleRowsOf(rows, 'stock_intake').map((r) => r.id)).toEqual(['a', 'c']);
  });
});

describe('nextProposalId', () => {
  it('ardındaki önerinin kimliğini verir', () => {
    expect(nextProposalId(rows, 'a')).toBe('b');
  });

  it('SÜZGEÇLİ listede sıradaki, süzgecin dışındakini atlar', () => {
    // Süzgeç açıkken "a"nın ardındaki "b" değil "c": operatör "b"yi ekranda hiç görmüyor.
    expect(nextProposalId(visibleRowsOf(rows, 'stock_intake'), 'a')).toBe('c');
  });

  it('listenin sonunda BAŞA DÖNMEZ — boş döner, diyalog kapanır', () => {
    expect(nextProposalId(rows, 'c')).toBe('');
  });

  it('kimlik listede yoksa geçilecek yer de yoktur', () => {
    expect(nextProposalId(rows, 'yok')).toBe('');
  });
});
