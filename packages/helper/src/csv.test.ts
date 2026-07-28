import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

/**
 * CSV yazımı — doğrulanan şey biçim değil, **kaçış**: kaçırılan tek bir ayraç ya da tırnak dosyanın
 * o satırdan sonrasını kaydırır ve muhasebe yazılımı yanlış sütunu okur.
 */
const COLUMNS = [
  { key: 'ref' as const, label: 'Referans' },
  { key: 'label' as const, label: 'Açıklama' },
  { key: 'amount' as const, label: 'Tutar' },
];

describe('toCsv', () => {
  it('başlık + satır yazar; varsayılan ayraç noktalı virgül (FR Excel)', () => {
    const csv = toCsv([{ ref: 'LA-26-7K4M2P', label: 'İçli köfte', amount: 21.1 }], COLUMNS);
    expect(csv).toBe('Referans;Açıklama;Tutar\nLA-26-7K4M2P;İçli köfte;21.1\n');
  });

  it('başlık kapatılabilir — bazı muhasebe yazılımları başlıksız dosya bekler', () => {
    const csv = toCsv([{ ref: 'A', label: 'B', amount: 1 }], COLUMNS, { header: false });
    expect(csv).toBe('A;B;1\n');
  });

  it('ayraç içeren değer tırnaklanır — sütun kaymaz', () => {
    const csv = toCsv([{ ref: 'A', label: 'Kutu; jel', amount: 1 }], COLUMNS, { header: false });
    expect(csv).toBe('A;"Kutu; jel";1\n');
  });

  it('tırnak ikilenir, satır sonu tırnak içinde kalır (RFC 4180)', () => {
    const csv = toCsv([{ ref: 'A', label: 'Adı "özel"\niki satır', amount: 1 }], COLUMNS, { header: false });
    expect(csv).toBe('A;"Adı ""özel""\niki satır";1\n');
  });

  it('null/undefined BOŞ hücredir — "null" metni yazılsaydı yazılım onu değer sanardı', () => {
    const csv = toCsv([{ ref: null, label: undefined, amount: 0 }], COLUMNS, { header: false });
    expect(csv).toBe(';;0\n');
  });

  it('ayraç değiştirilebilir; o zaman kaçış da ona göre yapılır', () => {
    const csv = toCsv([{ ref: 'A', label: 'x,y', amount: 1 }], COLUMNS, { header: false, separator: ',' });
    expect(csv).toBe('A,"x,y",1\n');
  });

  it('satır yoksa yalnız başlık çıkar — boş dönem de dosya üretir', () => {
    expect(toCsv([], COLUMNS)).toBe('Referans;Açıklama;Tutar\n');
  });
});
