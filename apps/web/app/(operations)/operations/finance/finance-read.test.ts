import { describe, expect, it } from 'vitest';
import { nextUnexplainedKey } from './finance-read';
import { ledgerRowKey, type MovementRowView } from './finance-types';

/**
 * Sıradaki izah bekleyen satır (12.19) — panelde karar verilince açılan satır. Kuralın okuduğu yalnız
 * satırın anahtarı ve izahı; fikstür o iki alanı taşır.
 */
const row = (id: string, explained: boolean) => ({ id, ledgerAccountId: 'hesap', explained }) as MovementRowView;
const key = (id: string) => ledgerRowKey(row(id, false));
const rows = [row('a', false), row('b', true), row('c', false), row('d', false)];

describe('nextUnexplainedKey', () => {
  it('şimdiki satırdan SONRAKİ izah bekleyen', () => {
    expect(nextUnexplainedKey(rows, key('a'))).toBe(key('c'));
    expect(nextUnexplainedKey(rows, key('c'))).toBe(key('d'));
  });

  it('sonda bulunamazsa baştan döner', () => {
    expect(nextUnexplainedKey(rows, key('d'))).toBe(key('a'));
  });

  it('şimdiki satır sayılmaz — liste henüz tazelenmemişken aynı satırı yeniden açmaz', () => {
    expect(nextUnexplainedKey([row('a', false)], key('a'))).toBeNull();
  });

  it('seçim yokken ilk izah bekleyen; hiç yoksa null', () => {
    expect(nextUnexplainedKey(rows, null)).toBe(key('a'));
    expect(nextUnexplainedKey([row('a', true)], null)).toBeNull();
  });
});
