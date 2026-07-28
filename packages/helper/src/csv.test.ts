import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

/**
 * CSV yazımı — doğrulanan şey biçim değil, **kaçış**: kaçırılan tek bir ayraç ya da tırnak dosyanın
 * o satırdan sonrasını kaydırır ve muhasebe yazılımı yanlış sütunu okur.
 */
const SUTUNLAR = [
  { key: 'ref' as const, label: 'Referans' },
  { key: 'ad' as const, label: 'Açıklama' },
  { key: 'tutar' as const, label: 'Tutar' },
];

describe('toCsv', () => {
  it('başlık + satır yazar; varsayılan ayraç noktalı virgül (FR Excel)', () => {
    const csv = toCsv([{ ref: 'LA-26-7K4M2P', ad: 'İçli köfte', tutar: 21.1 }], SUTUNLAR);
    expect(csv).toBe('Referans;Açıklama;Tutar\nLA-26-7K4M2P;İçli köfte;21.1\n');
  });

  it('başlık kapatılabilir — bazı muhasebe yazılımları başlıksız dosya bekler', () => {
    const csv = toCsv([{ ref: 'A', ad: 'B', tutar: 1 }], SUTUNLAR, { header: false });
    expect(csv).toBe('A;B;1\n');
  });

  it('ayraç içeren değer tırnaklanır — sütun kaymaz', () => {
    const csv = toCsv([{ ref: 'A', ad: 'Kutu; jel', tutar: 1 }], SUTUNLAR, { header: false });
    expect(csv).toBe('A;"Kutu; jel";1\n');
  });

  it('tırnak ikilenir, satır sonu tırnak içinde kalır (RFC 4180)', () => {
    const csv = toCsv([{ ref: 'A', ad: 'Adı "özel"\niki satır', tutar: 1 }], SUTUNLAR, { header: false });
    expect(csv).toBe('A;"Adı ""özel""\niki satır";1\n');
  });

  it('null/undefined BOŞ hücredir — "null" metni yazılsaydı yazılım onu değer sanardı', () => {
    const csv = toCsv([{ ref: null, ad: undefined, tutar: 0 }], SUTUNLAR, { header: false });
    expect(csv).toBe(';;0\n');
  });

  it('ayraç değiştirilebilir; o zaman kaçış da ona göre yapılır', () => {
    const csv = toCsv([{ ref: 'A', ad: 'x,y', tutar: 1 }], SUTUNLAR, { header: false, separator: ',' });
    expect(csv).toBe('A,"x,y",1\n');
  });

  it('satır yoksa yalnız başlık çıkar — boş dönem de dosya üretir', () => {
    expect(toCsv([], SUTUNLAR)).toBe('Referans;Açıklama;Tutar\n');
  });
});
